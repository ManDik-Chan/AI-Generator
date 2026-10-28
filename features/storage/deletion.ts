import "server-only";
import { prisma } from "@/lib/database/prisma";
import { createSupabaseAdminClient } from "@/lib/auth/supabase/admin";
import { authorizedToolAssetBucket, validateObjectIdentity, type ObjectIdentity, type AssetKind } from "./owned-target";

export class AssetCleanupPending extends Error { constructor(public state: "PENDING" | "BLOCKED" = "PENDING") { super("ASSET_CLEANUP_" + state); } }
const identity = (task: { kind: string; ownerId: string; resourceId: string; scopeId: string | null; bucket: string; path: string }): ObjectIdentity => ({ ...task, kind: task.kind as AssetKind });

export async function requestDeletion(target: ObjectIdentity) {
  if (!validateObjectIdentity(target)) throw new AssetCleanupPending("BLOCKED");
  // Only an already verified source transition or a write-ahead upload
  // reservation can authorize removal. Arbitrary path-shaped input cannot.
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.asset_deletions WHERE bucket=${target.bucket} AND path=${target.path} FOR UPDATE`;
    const task = await tx.assetDeletion.findUnique({ where: { bucket_path: { bucket: target.bucket, path: target.path } } });
    if (!task || task.ownerId !== target.ownerId || task.resourceId !== target.resourceId || task.kind !== target.kind || task.scopeId !== target.scopeId) throw new AssetCleanupPending("BLOCKED");
    if (task.state === "TRACKED" || task.state === "BLOCKED") throw new AssetCleanupPending("BLOCKED");
    if (task.state === "RESERVED") await tx.assetDeletion.update({ where: { id: task.id }, data: { state: "PENDING" } });
    return task.id;
  });
}

// A write-ahead reservation retains the key even if upload succeeds and record
// creation/compensation crashes. RESERVED is never falsely reported deleted.
export async function reserveObject(target: ObjectIdentity) {
  if (!validateObjectIdentity(target)) throw new AssetCleanupPending("BLOCKED");
  await prisma.assetDeletion.create({ data: { ...target, state: "RESERVED" } });
}

export async function performDeletion(id: string, remove?: () => Promise<void>) {
  // Serialize attempts with a DB row lock. The transaction may roll back after
  // Storage success; the durable PENDING row then causes an idempotent retry.
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.asset_deletions WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows.length) throw new AssetCleanupPending("BLOCKED");
      const task = await tx.assetDeletion.findUniqueOrThrow({ where: { id } });
      if (task.state === "COMPLETE") return;
      if (task.state !== "PENDING" || !validateObjectIdentity(identity(task))) throw new AssetCleanupPending("BLOCKED");
      await tx.assetDeletion.update({ where: { id }, data: { attempts: { increment: 1 } } });
      if (remove) await remove();
      else await deletePendingObjectBytes(task.bucket, task.path);
      await tx.assetDeletion.update({ where: { id }, data: { state: "COMPLETE", completedAt: new Date(), lastErrorCode: null } });
      if (task.kind === "TOOL_ASSET") await tx.toolAsset.deleteMany({ where: { id: task.resourceId, userId: task.ownerId, storagePath: task.path, deletionRequestedAt: { not: null } } });
      else await tx.generatedImage.deleteMany({ where: { id: task.resourceId, userId: task.ownerId, storagePath: task.path, deletionRequestedAt: { not: null } } });
    }, { timeout: 20_000, maxWait: 20_000 });
  } catch (error) {
    // The intent existed before the transaction. Never erase it on DB failure.
    const state = error instanceof AssetCleanupPending && error.state === "BLOCKED" ? "BLOCKED" : "PENDING";
    await prisma.assetDeletion.updateMany({ where: { id, state: { not: "COMPLETE" } }, data: { state, attempts: { increment: 1 }, lastErrorCode: state === "BLOCKED" ? "OWNERSHIP_UNPROVEN" : "DELETE_RETRY_REQUIRED", nextAttemptAt: new Date(Date.now() + 60_000) } }).catch(() => undefined);
    throw new AssetCleanupPending(state);
  }
}

// The only SDK remove call. Every legacy wrapper must present an immutable,
// pending DB intent. Calling it with a path alone cannot grant deletion power.
export async function deletePendingObjectBytes(bucket: string, path: string) {
  const task = await prisma.assetDeletion.findUnique({ where: { bucket_path: { bucket, path } } });
  if (!task || task.state !== "PENDING" || !validateObjectIdentity(identity(task))) throw new AssetCleanupPending("BLOCKED");
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw new AssetCleanupPending();
}

export async function removeIssuedObject(target: ObjectIdentity) {
  const id = await requestDeletion(target);
  await performDeletion(id);
}

export async function prepareToolAssetDeletion(userId: string, runId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM public.tool_runs WHERE id=${runId}::uuid AND user_id=${userId}::uuid FOR UPDATE`;
    const run = await tx.toolRun.findFirst({ where: { id: runId, userId } });
    if (!run) return [];
    const assets = await tx.toolAsset.findMany({ where: { toolRunId: runId, userId } });
    const targets = assets.filter(a => a.storagePath).map(a => ({ kind: "TOOL_ASSET" as const, ownerId: userId, resourceId: a.id, scopeId: runId, bucket: authorizedToolAssetBucket(a.storageBucket), path: a.storagePath }));
    if (targets.some(t => !validateObjectIdentity(t))) throw new AssetCleanupPending("BLOCKED");
    await tx.toolRun.update({ where: { id: runId }, data: { storageDeletionRequestedAt: new Date() } });
    for (const target of targets) {
      await tx.toolAsset.update({ where: { id: target.resourceId }, data: { deletionRequestedAt: new Date(), storageBucket: target.bucket } });
      const task = await tx.assetDeletion.upsert({ where: { bucket_path: { bucket: target.bucket, path: target.path } }, create: { ...target, state: "PENDING" }, update: {} });
      if (task.state === "TRACKED" || task.state === "RESERVED") await tx.assetDeletion.update({ where: { id: task.id }, data: { state: "PENDING" } });
      // COMPLETE never returns to PENDING (the DB trigger also enforces this).
      if (task.ownerId !== userId || task.resourceId !== target.resourceId) throw new AssetCleanupPending("BLOCKED");
    }
    return targets;
  });
}

export async function markGeneratedDeletion(userId: string, imageId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.generated_images WHERE id=${imageId}::uuid AND user_id=${userId}::uuid FOR UPDATE`;
    const image = await tx.generatedImage.findFirst({ where: { id: imageId, userId }, include: { personaAvatar: true } });
    if (!image || image.personaAvatar) throw new AssetCleanupPending("BLOCKED");
    const target: ObjectIdentity = { ownerId: userId, resourceId: image.id, kind: image.kind, scopeId: image.kind === "PERSONA_AVATAR" ? image.storagePath.split("/")[1] : null, bucket: image.storageBucket, path: image.storagePath };
    if (!validateObjectIdentity(target)) throw new AssetCleanupPending("BLOCKED");
    await tx.generatedImage.update({ where: { id: imageId }, data: { deletionRequestedAt: new Date() } });
    const task = await tx.assetDeletion.upsert({ where: { bucket_path: { bucket: target.bucket, path: target.path } }, create: { ...target, state: "PENDING" }, update: {} });
    if (task.ownerId !== target.ownerId || task.resourceId !== target.resourceId || task.kind !== target.kind || task.scopeId !== target.scopeId) throw new AssetCleanupPending("BLOCKED");
    if (task.state === "TRACKED" || task.state === "RESERVED") await tx.assetDeletion.update({ where: { id: task.id }, data: { state: "PENDING" } });
    return { id: task.id, target };
  });
}

export async function retryAssetDeletions(take = 100) {
  const tasks = await prisma.assetDeletion.findMany({ where: { state: "PENDING", nextAttemptAt: { lte: new Date() } }, take, orderBy: { createdAt: "asc" } });
  let complete = 0;
  for (const task of tasks) { try { await performDeletion(task.id); complete++; } catch { /* durable retry state retained */ } }
  return { attempted: tasks.length, complete, pending: await prisma.assetDeletion.count({ where: { state: "PENDING" } }), blocked: await prisma.assetDeletion.count({ where: { state: { in: ["BLOCKED", "RESERVED"] } } }) };
}
