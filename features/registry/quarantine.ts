import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { canonicalHash } from "./canonical";
import { RegistryProtocolError } from "./protocol";
import { authenticate, authority, fail, parse, readInput, transaction, uuid, type Context } from "./release-context";
import { digestBytes, MAX_REGISTRY_BYTES, normalizeRegistryBytes, QUARANTINE_POLICY_REVISION, SANITIZER_REVISION, SCANNER_REVISION } from "./quarantine-content";
import { assertRegistryBuckets, candidatePath, CANDIDATE_BUCKET, objectGeneration, putRegistryObject, quarantinePath,
  QUARANTINE_BUCKET, readRegistryObject } from "./quarantine-storage";

const stageInput = readInput.extend({ idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), input: z.object({ assetId: uuid }).strict() }).strict();
const verifyInput = readInput.extend({ input: z.object({ quarantineId: uuid }).strict() }).strict();
type StageInput = z.input<typeof stageInput>;
type VerifyInput = z.input<typeof verifyInput>;
type Quarantine = { id: string; project_id: string; asset_id: string; actor_id: string; body_hash: string; authz_epoch: number;
  source_digest: string; mime: string; size: number; rights_hash: string; scan_revision: number; policy_revision: number;
  bucket: string; object_path: string; storage_object_id: string; storage_version: string };
type Intent = Omit<Quarantine, "storage_object_id" | "storage_version">;
function enabled() {
  if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true" || process.env.REGISTRY_QUARANTINE_ENABLED !== "true") fail("DISABLED", 403);
}
async function assetFor(ctx: Context, assetId: string) {
  const [asset] = await ctx.tx.$queryRaw<{ id: string; source_digest: string; mime: string; size: number; rights_ref: string;
    provenance: unknown; scan_revision: number; state: string; data_class: string }[]>`
    SELECT id,source_digest,mime,size,rights_ref,provenance,scan_revision,state,data_class
      FROM public.project_assets WHERE id=${assetId}::uuid AND project_id=${ctx.project.id}::uuid FOR SHARE`;
  if (!asset) return fail("NOT_FOUND", 404);
  if (["RETIRED", "REJECTED"].includes(asset.state) || asset.data_class !== "CURATED" || !asset.rights_ref.trim()) return fail("ASSET_INVALID");
  return asset;
}
async function current(ctx: Context, job: Intent) {
  const asset = await assetFor(ctx, job.asset_id);
  if (job.authz_epoch !== ctx.project.authzEpoch || job.policy_revision !== QUARANTINE_POLICY_REVISION
    || job.scan_revision !== asset.scan_revision || job.source_digest !== asset.source_digest || job.mime !== asset.mime
    || job.size !== asset.size || job.rights_hash !== canonicalHash({ rights: asset.rights_ref, provenance: asset.provenance })) return fail("STALE_QUARANTINE");
  if (job.project_id !== ctx.project.id) return fail("OBJECT_CHANGED");
  await authority(ctx, job.actor_id, "INGEST_ASSET");
  return asset;
}
async function actual(ctx: Context, job: Quarantine) {
  if (job.bucket !== QUARANTINE_BUCKET || job.object_path !== quarantinePath(ctx.project.id, job.asset_id, job.id, job.source_digest)) return fail("OBJECT_CHANGED");
  const object = await objectGeneration(ctx.tx, QUARANTINE_BUCKET, job.object_path);
  if (object.id !== job.storage_object_id || object.version !== job.storage_version) return fail("OBJECT_CHANGED");
  const downloaded = await readRegistryObject(job.object_path);
  if (digestBytes(downloaded.bytes) !== job.source_digest || downloaded.bytes.length !== job.size || downloaded.mime !== job.mime
    || object.metadata.size !== job.size || object.metadata.mimetype !== job.mime) return fail("OBJECT_CHANGED");
  return downloaded.bytes;
}
async function normalized(bytes: Uint8Array, mime: string) {
  try { return await normalizeRegistryBytes(bytes, mime); }
  catch { return fail("INVALID_CONTENT", 422); }
}
async function boundary<T>(work: () => Promise<T>) {
  try { return await work(); }
  catch (error) { if (error instanceof RegistryProtocolError) throw error; return fail("UNAVAILABLE", 503); }
}
async function reserve(ctx: Context, assetId: string, kind: "SOURCE" | "CANDIDATE", key: string, bodyHash: string, job?: Quarantine): Promise<Intent> {
  const [existing] = await ctx.tx.$queryRaw<Intent[]>`SELECT * FROM registry_private.asset_object_intents
    WHERE project_id=${ctx.project.id}::uuid AND actor_id=${ctx.actor.id}::uuid AND kind=${kind} AND idempotency_key=${key}`;
  if (existing) {
    if (existing.body_hash !== bodyHash) return fail("IDEMPOTENCY_CONFLICT");
    // Candidate issuer has VERIFY authority, source issuer has INGEST authority.
    // Job freshness was checked separately for candidates.
    if (kind === "SOURCE") await current(ctx, existing);
    return existing;
  }
  const asset = await assetFor(ctx, assetId), id = randomUUID();
  const bucket = kind === "SOURCE" ? QUARANTINE_BUCKET : CANDIDATE_BUCKET;
  const path = kind === "SOURCE" ? quarantinePath(ctx.project.id, assetId, id, asset.source_digest) : candidatePath(ctx.project.id, assetId, job!.id, id);
  const rightsHash = canonicalHash({ rights: asset.rights_ref, provenance: asset.provenance });
  await ctx.tx.$executeRaw`INSERT INTO registry_private.asset_object_intents
    (id,project_id,asset_id,actor_id,kind,quarantine_id,idempotency_key,body_hash,authz_epoch,source_digest,mime,size,rights_hash,scan_revision,policy_revision,bucket,object_path)
    VALUES(${id}::uuid,${ctx.project.id}::uuid,${assetId}::uuid,${ctx.actor.id}::uuid,${kind},${job?.id ?? null}::uuid,${key},${bodyHash},${ctx.project.authzEpoch},
      ${asset.source_digest},${asset.mime},${asset.size},${rightsHash},${asset.scan_revision},${QUARANTINE_POLICY_REVISION},${bucket},${path})`;
  return { id, project_id: ctx.project.id, asset_id: assetId, actor_id: ctx.actor.id, body_hash: bodyHash, authz_epoch: ctx.project.authzEpoch,
    source_digest: asset.source_digest, mime: asset.mime, size: asset.size, rights_hash: rightsHash, scan_revision: asset.scan_revision,
    policy_revision: QUARANTINE_POLICY_REVISION, bucket, object_path: path };
}
async function stored(bucket: typeof QUARANTINE_BUCKET | typeof CANDIDATE_BUCKET, path: string, bytes: Uint8Array, mime: string) {
  const present = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM storage.objects WHERE bucket_id=${bucket} AND name=${path}`;
  // A retained intent owns this exact key. On response loss reuse its object,
  // then independently check generation and bytes; never upsert or overwrite.
  if (!present.length) await putRegistryObject(bucket, path, bytes, mime);
  const object = await objectGeneration(prisma, bucket, path), readback = await readRegistryObject(path, bucket);
  if (object.metadata.size !== bytes.length || object.metadata.mimetype !== mime || readback.mime !== mime
    || digestBytes(readback.bytes) !== digestBytes(bytes) || readback.bytes.length !== bytes.length) return fail("OBJECT_CHANGED");
  const after = await objectGeneration(prisma, bucket, path);
  if (after.id !== object.id || after.version !== object.version) return fail("OBJECT_CHANGED");
  return object;
}

/** Internal server command only. No routes, signed URLs or arbitrary locators. */
export async function stageRegistryAsset(input: StageInput, source: Uint8Array) {
  enabled();
  const args = parse(stageInput, input);
  // Snapshot immediately, before Auth or any asynchronous work can mutate it.
  if (!(source instanceof Uint8Array) || !source.byteLength || source.byteLength > MAX_REGISTRY_BYTES) return fail("ASSET_INVALID");
  const bytes = Uint8Array.from(source), digest = digestBytes(bytes), actor = await authenticate(args.accessToken);
  const bodyHash = canonicalHash({ projectId: args.projectId, input: args.input, sourceDigest: digest, sourceSize: bytes.length });
  // Commit a durable intent before external I/O. A failed final transaction
  // leaves auditable private bytes, with no quarantine/verification authority.
  const intent = await boundary(() => transaction(actor, args.projectId, "INGEST_ASSET", async ctx => {
    const [prior] = await ctx.tx.$queryRaw<{ body_hash: string }[]>`SELECT body_hash FROM registry_private.asset_object_intents
      WHERE project_id=${ctx.project.id}::uuid AND actor_id=${actor.id}::uuid AND kind='SOURCE' AND idempotency_key=${args.idempotencyKey}`;
    if (prior && prior.body_hash !== bodyHash) return fail("IDEMPOTENCY_CONFLICT");
    const asset = await assetFor(ctx, args.input.assetId);
    if (asset.source_digest !== digest || asset.size !== bytes.length) return fail("ASSET_INVALID");
    await normalized(bytes, asset.mime);
    return reserve(ctx, asset.id, "SOURCE", args.idempotencyKey, bodyHash);
  }));
  return boundary(() => transaction(actor, args.projectId, "INGEST_ASSET", async ctx => {
    await assertRegistryBuckets(ctx.tx);
    const [existing] = await ctx.tx.$queryRaw<Quarantine[]>`SELECT * FROM registry_private.asset_quarantine
      WHERE project_id=${ctx.project.id}::uuid AND actor_id=${actor.id}::uuid AND idempotency_key=${args.idempotencyKey}`;
    if (existing) {
      if (existing.body_hash !== bodyHash) return fail("IDEMPOTENCY_CONFLICT");
      await current(ctx, existing); await actual(ctx, existing);
      return { id: existing.id, state: "QUARANTINED" as const };
    }
    const asset = await current(ctx, intent), id = intent.id, path = intent.object_path;
    // Upload uses a separate Storage connection, invisible to this Serializable
    // snapshot. Capture generation with a fresh owner connection, then read bytes.
    // If commit fails, the object remains private and has no usable DB authority.
    const object = await stored(QUARANTINE_BUCKET, path, bytes, asset.mime);
    const rightsHash = canonicalHash({ rights: asset.rights_ref, provenance: asset.provenance });
    await ctx.tx.$executeRaw`INSERT INTO registry_private.asset_quarantine
      (id,project_id,asset_id,actor_id,idempotency_key,body_hash,authz_epoch,source_digest,mime,size,rights_hash,scan_revision,policy_revision,bucket,object_path,storage_object_id,storage_version)
      VALUES(${id}::uuid,${ctx.project.id}::uuid,${asset.id}::uuid,${actor.id}::uuid,${args.idempotencyKey},${bodyHash},${ctx.project.authzEpoch},
        ${digest},${asset.mime},${bytes.length},${rightsHash},${asset.scan_revision},${QUARANTINE_POLICY_REVISION},${QUARANTINE_BUCKET},${path},${object.id}::uuid,${object.version})`;
    return { id, state: "QUARANTINED" as const };
  }));
}

/** Re-read the actual object; a persisted attestation is never activation proof. */
export async function verifyRegistryAsset(input: VerifyInput) {
  enabled(); const args = parse(verifyInput, input), actor = await authenticate(args.accessToken);
  const intent = await boundary(() => transaction(actor, args.projectId, "VERIFY_ASSET", async ctx => {
    const [job] = await ctx.tx.$queryRaw<Quarantine[]>`SELECT * FROM registry_private.asset_quarantine
      WHERE id=${args.input.quarantineId}::uuid AND project_id=${ctx.project.id}::uuid FOR SHARE`;
    if (!job) return fail("NOT_FOUND", 404);
    if (job.actor_id === actor.id) return fail("INDEPENDENT_REVIEW_REQUIRED", 403);
    await current(ctx, job);
    return reserve(ctx, job.asset_id, "CANDIDATE", job.id, canonicalHash({ quarantineId: job.id, policy: QUARANTINE_POLICY_REVISION,
      scan: job.scan_revision, scanner: SCANNER_REVISION, sanitizer: SANITIZER_REVISION }), job);
  }));
  return boundary(() => transaction(actor, args.projectId, "VERIFY_ASSET", async ctx => {
    await assertRegistryBuckets(ctx.tx);
    const [job] = await ctx.tx.$queryRaw<Quarantine[]>`SELECT * FROM registry_private.asset_quarantine
      WHERE id=${args.input.quarantineId}::uuid AND project_id=${ctx.project.id}::uuid FOR SHARE`;
    if (!job) return fail("NOT_FOUND", 404);
    if (job.actor_id === actor.id) return fail("INDEPENDENT_REVIEW_REQUIRED", 403);
    await current(ctx, job);
    const bytes = await actual(ctx, job), id = intent.id, path = candidatePath(ctx.project.id, job.asset_id, job.id, id);
    const [existing] = await ctx.tx.$queryRaw<{ candidate_object_id: string; candidate_version: string; candidate_digest: string; candidate_size: number; candidate_mime: string }[]>`
      SELECT candidate_object_id,candidate_version,candidate_digest,candidate_size,candidate_mime FROM registry_private.asset_verifications WHERE id=${id}::uuid`;
    if (existing) {
      const generation = await objectGeneration(ctx.tx, CANDIDATE_BUCKET, path), downloaded = await readRegistryObject(path, CANDIDATE_BUCKET);
      if (generation.id !== existing.candidate_object_id || generation.version !== existing.candidate_version || digestBytes(downloaded.bytes) !== existing.candidate_digest
        || downloaded.bytes.length !== existing.candidate_size || downloaded.mime !== existing.candidate_mime) return fail("OBJECT_CHANGED");
      return { id, state: "BLOCKED" as const, reason: "SCANNER_UNAVAILABLE" as const };
    }
    const candidate = await normalized(bytes, job.mime), digest = digestBytes(candidate.bytes);
    const generation = await stored(CANDIDATE_BUCKET, path, candidate.bytes, candidate.mime);
    // Scanner is deliberately unavailable. No runtime flag or supplied verdict
    // can mint PASS, change ProjectAsset lifecycle, or activate delivery.
    await ctx.tx.$executeRaw`INSERT INTO registry_private.asset_verifications
      (id,project_id,quarantine_id,actor_id,source_digest,source_size,source_mime,candidate_digest,candidate_size,candidate_mime,candidate_path,
        storage_object_id,storage_version,candidate_object_id,candidate_version,policy_revision,scan_revision,scanner_revision,sanitizer_revision,outcome,reason)
      VALUES(${id}::uuid,${ctx.project.id}::uuid,${job.id}::uuid,${actor.id}::uuid,${job.source_digest},${bytes.length},${job.mime},
        ${digest},${candidate.bytes.length},${candidate.mime},${path},${job.storage_object_id}::uuid,${job.storage_version},${generation.id}::uuid,${generation.version},
        ${QUARANTINE_POLICY_REVISION},${job.scan_revision},${SCANNER_REVISION},${SANITIZER_REVISION},'BLOCKED','SCANNER_UNAVAILABLE')`;
    return { id, state: "BLOCKED" as const, reason: "SCANNER_UNAVAILABLE" as const };
  }));
}
