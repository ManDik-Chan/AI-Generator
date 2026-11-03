import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { authenticate, RegistryProtocolError, session } from "./protocol";
import { createdProjectSchema, createProjectRequestSchema, idempotencyKeySchema } from "./write-contracts";

async function createProject(accessToken: string, input: unknown, key?: string) {
  if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true") throw new RegistryProtocolError("DISABLED", 403);
  const { slug } = createProjectRequestSchema.parse(input);
  if (key !== undefined) idempotencyKeySchema.parse(key);
  const actor = await authenticate(accessToken);
  const subject = actor.id;
  try {
    return await prisma.$transaction(async tx => {
      await session(tx, actor);
      // Serialize creates and revocations for this subject. READ COMMITTED lets
      // the next statement see a receipt committed by the prior lock holder.
      const operators = await tx.$queryRaw<{ subject_id: string }[]>`
        SELECT subject_id FROM registry_private.internal_operators
        WHERE subject_id=${subject}::uuid AND active AND can_create
          AND expires_at>clock_timestamp() FOR UPDATE`;
      if (operators.length !== 1) throw new RegistryProtocolError("FORBIDDEN", 403);
      const [receipt] = key === undefined ? [] : await tx.$queryRaw<{ project_id: string; slug: string }[]>`
        SELECT project_id,slug FROM registry_private.project_creation_receipts
        WHERE actor_id=${subject}::uuid AND idempotency_key=${key}`;
      if (receipt && receipt.slug !== slug) throw new RegistryProtocolError("IDEMPOTENCY_CONFLICT", 409);
      let project;
      if (receipt) {
        const [current] = await tx.$queryRaw<{ id: string; slug: string }[]>`
          SELECT id,slug FROM public.projects WHERE id=${receipt.project_id}::uuid
          AND owner_id=${subject}::uuid AND slug=${slug} AND archived_at IS NULL FOR SHARE`;
        if (!current) throw new RegistryProtocolError("REPLAY_STALE", 409);
        project = current;
      } else {
        project = await tx.project.create({ data: { slug, ownerId: subject }, select: { id: true, slug: true } });
        await tx.projectDraft.create({ data: { projectId: project.id, updatedBy: subject } });
        if (key !== undefined) await tx.$executeRaw`
          INSERT INTO registry_private.project_creation_receipts(actor_id,idempotency_key,project_id,slug)
          VALUES(${subject}::uuid,${key},${project.id}::uuid,${slug})`;
      }
      await session(tx, actor);
      const [fresh] = await tx.$queryRaw<{ valid: boolean }[]>`
        SELECT expires_at>clock_timestamp() AS valid FROM registry_private.internal_operators WHERE subject_id=${subject}::uuid`;
      if (!fresh?.valid) throw new RegistryProtocolError("FORBIDDEN", 403);
      return { result: createdProjectSchema.parse(project), replayed: Boolean(receipt) };
    }, { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 5000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new RegistryProtocolError("CONFLICT", 409);
    }
    throw error;
  }
}

export async function createInternalRegistryProject(accessToken: string, input: unknown) {
  try { return (await createProject(accessToken, input)).result; }
  catch (error) {
    if (error instanceof RegistryProtocolError) {
      if (error.code === "DISABLED") throw new Error("Registry internal access is disabled");
      if (error.code === "AUTH_REQUIRED") throw new Error("Registry authentication required");
      if (error.code === "FORBIDDEN") throw new Error("Eligible internal creator required");
    }
    throw error;
  }
}

export function createRegistryProjectCommand(accessToken: string, input: unknown, idempotencyKey: string) {
  return createProject(accessToken, input, idempotencyKey);
}
