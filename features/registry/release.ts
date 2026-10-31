import "server-only";

import { z } from "zod";
import { canonicalHash, HASH_ALGORITHM, hashSnapshot } from "./canonical";
import { collectAssetReferences, validateDraftPayload, type DraftPayload } from "./contracts";
import { RegistryProtocolError } from "./protocol";
import {
  authenticate, authority, enabled, fail, hash, parse, readInput, RELEASE_POLICY_REVISION,
  transaction, uuid, writeInput, type Action, type Context, type ReadInput, type WriteInput,
} from "./release-context";

type Response = { result: { id: string; projectId: string; versionId?: string; state: string }; etag: string };
type Request = {
  id: string; project_id: string; version_id: string; content_hash: string; visibility: string;
  asset_digest_set: unknown; authz_epoch: number; project_revision: number; current_release_id: string | null;
  policy_revision: number; intent: string; target_release_id: string | null; requester_id: string; expires_at: Date;
};
type Approval = { id: string; request_id: string; reviewer_id: string };
type Release = { id: string; version_id: string; content_hash: string; visibility_at_approval: string; authorization_id: string | null };

export function releaseETag(project: { id: string; revision: number }) { return `"release:${project.id}:${project.revision}"`; }
function precondition(value: string | undefined, projectId: string) {
  if (!value) return fail("PRECONDITION_REQUIRED", 428);
  const match = /^"release:([0-9a-f-]{36}):([1-9][0-9]*)"$/.exec(value);
  if (!match || match[1] !== projectId || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) > 2147483647) return fail("INVALID_INPUT", 422);
  return Number(match[2]);
}
async function clock(ctx: Context) { return (await ctx.tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now; }
async function requestFor(ctx: Context, id: string) {
  const [request] = await ctx.tx.$queryRaw<Request[]>`SELECT * FROM registry_private.release_requests
    WHERE id=${id}::uuid AND project_id=${ctx.project.id}::uuid`;
  if (!request) return fail("NOT_FOUND", 404);
  return request;
}
async function approvalFor(ctx: Context, id: string) {
  const [approval] = await ctx.tx.$queryRaw<Approval[]>`SELECT id,request_id,reviewer_id FROM registry_private.release_approvals
    WHERE id=${id}::uuid AND project_id=${ctx.project.id}::uuid`;
  if (!approval) return fail("NOT_FOUND", 404);
  return approval;
}
async function releaseFor(ctx: Context, id: string) {
  const [release] = await ctx.tx.$queryRaw<Release[]>`SELECT id,version_id,content_hash,visibility_at_approval,authorization_id FROM public.project_releases
    WHERE id=${id}::uuid AND project_id=${ctx.project.id}::uuid`;
  if (!release) return fail("NOT_FOUND", 404);
  return release;
}
async function assetBindings(ctx: Context, content: DraftPayload) {
  const refs = collectAssetReferences(content), ids = [...new Set(refs.map(ref => ref.id))].sort();
  if (!ids.length) return [];
  const rows = await ctx.tx.$queryRaw<{ id: string; source_digest: string; delivery_digest: string | null; scan_revision: number;
    mime: string; size: number; data_class: string; rights_ref: string; provenance: unknown; state: string }[]>`
    SELECT id,source_digest,delivery_digest,scan_revision,mime,size,data_class,rights_ref,provenance,state
    FROM public.project_assets WHERE project_id=${ctx.project.id}::uuid AND id=ANY(${ids}::uuid[]) ORDER BY id FOR SHARE`;
  if (rows.length !== ids.length) return fail("ASSET_INVALID");
  return rows.map(a => {
    if (a.state !== "APPROVED" || !a.delivery_digest || a.data_class !== "CURATED" || !a.rights_ref.trim()
      || !["text/markdown", "image/png", "image/jpeg", "image/webp"].includes(a.mime)
      || refs.some(ref => ref.id === a.id && (ref.usage === "markdown" ? a.mime !== "text/markdown" : ref.usage === "image" && !a.mime.startsWith("image/")))) return fail("ASSET_INVALID");
    // Metadata authorization only. storage_ref is deliberately neither returned
    // nor trusted as evidence of real bytes, sanitation or an independent ACL.
    return { assetId: a.id, sourceDigest: a.source_digest, deliveryDigest: a.delivery_digest, scanRevision: a.scan_revision,
      mime: a.mime, size: a.size, dataClass: a.data_class, rightsHash: canonicalHash({ rights: a.rights_ref, provenance: a.provenance }) };
  });
}
async function versionContent(ctx: Context, versionId: string, expected: string) {
  const version = await ctx.tx.projectVersion.findFirst({ where: { id: versionId, projectId: ctx.project.id } });
  if (!version) return fail("NOT_FOUND", 404);
  let content: DraftPayload;
  try { content = validateDraftPayload(version.snapshot, { projectId: ctx.project.id, slug: ctx.project.slug }); }
  catch { return fail("HASH_MISMATCH"); }
  if (version.hashAlgorithm !== HASH_ALGORITHM || version.contentHash !== expected || hashSnapshot(content) !== expected
    || version.version !== content.manifest.version) return fail("HASH_MISMATCH");
  const review = await ctx.tx.publicationReview.findFirst({ where: { id: version.reviewId, projectId: ctx.project.id } });
  const invalid = await ctx.tx.$queryRaw<{ review_id: string }[]>`SELECT review_id FROM registry_private.review_invalidations WHERE review_id=${version.reviewId}::uuid`;
  // Original Review is immutable provenance, never current release permission.
  if (!review || review.decision !== "APPROVED" || review.snapshotHash !== expected || invalid.length) return fail("APPROVAL_INVALID");
  const bindings = await assetBindings(ctx, content);
  const docs = await ctx.tx.projectDocumentation.findMany({ where: { versionId, projectId: ctx.project.id } });
  if (docs.length !== content.documentation.length || content.documentation.some(doc => !docs.some(row => row.id === doc.id.toLowerCase()
    && row.assetId === doc.assetId.toLowerCase() && row.title === doc.title && row.language === doc.language
    && row.contentHash === bindings.find(a => a.assetId === doc.assetId.toLowerCase())?.deliveryDigest))) return fail("ASSET_INVALID");
  return { content, bindings };
}
async function freshness(ctx: Context, request: Request, approval?: Approval, consumed = false) {
  if (request.expires_at <= await clock(ctx) || request.policy_revision !== RELEASE_POLICY_REVISION
    || (!consumed && (request.authz_epoch !== ctx.project.authzEpoch || request.project_revision !== ctx.project.revision
      || request.current_release_id !== ctx.project.currentReleaseId))) return fail("APPROVAL_INVALID");
  ctx.deadlines.push(request.expires_at);
  await authority(ctx, request.requester_id, "REQUEST_RELEASE");
  if (approval) {
    if (approval.reviewer_id === request.requester_id) return fail("APPROVAL_INVALID");
    await authority(ctx, approval.reviewer_id, "APPROVE_RELEASE");
  }
  const { content, bindings } = await versionContent(ctx, request.version_id, request.content_hash);
  if (content.manifest.visibility !== request.visibility || canonicalHash(bindings) !== canonicalHash(request.asset_digest_set)) return fail("APPROVAL_INVALID");
  if (request.intent === "ROLLBACK") {
    if (!request.target_release_id) return fail("APPROVAL_INVALID");
    const target = await releaseFor(ctx, request.target_release_id);
    if (target.version_id !== request.version_id || target.content_hash !== request.content_hash
      || target.visibility_at_approval !== request.visibility || (!consumed && target.id === ctx.project.currentReleaseId)) return fail("APPROVAL_INVALID");
  }
}
async function mutate(action: Action, input: WriteInput, schema: z.ZodType, work: (ctx: Context, body: unknown) => Promise<Response>) {
  enabled(); const args = parse(writeInput, input), expected = precondition(args.ifMatch, args.projectId), body = parse(schema, args.input);
  const actor = await authenticate(args.accessToken);
  const bodyHash = canonicalHash({ action, projectId: args.projectId, ifMatch: args.ifMatch, input: body });
  return transaction(actor, args.projectId, action, async ctx => {
    const [receipt] = await ctx.tx.$queryRaw<{ action: string; body_hash: string; authz_epoch: number; result: Response }[]>`
      SELECT action,body_hash,authz_epoch,result FROM registry_private.release_receipts
      WHERE project_id=${args.projectId}::uuid AND actor_id=${actor.id}::uuid AND idempotency_key=${args.idempotencyKey}`;
    if (receipt) {
      if (receipt.action !== action || receipt.body_hash !== bodyHash) return fail("IDEMPOTENCY_CONFLICT");
      if (receipt.authz_epoch !== ctx.project.authzEpoch) return fail("REPLAY_STALE");
      try {
        if (action === "REQUEST_RELEASE") await freshness(ctx, await requestFor(ctx, receipt.result.result.id));
        if (action === "APPROVE_RELEASE") {
          const approval = await approvalFor(ctx, receipt.result.result.id);
          await freshness(ctx, await requestFor(ctx, approval.request_id), approval);
        }
        if (action === "PUBLISH_RELEASE" || action === "ROLLBACK_RELEASE") {
          if (ctx.project.currentReleaseId !== receipt.result.result.id || await withdrawn(ctx, receipt.result.result.id)) return fail("REPLAY_STALE");
          const release = await releaseFor(ctx, receipt.result.result.id);
          if (!release.authorization_id) return fail("REPLAY_STALE");
          const approval = await approvalFor(ctx, release.authorization_id);
          await freshness(ctx, await requestFor(ctx, approval.request_id), approval, true);
        }
      } catch (error) { if (!(error instanceof RegistryProtocolError)) throw error; return fail("REPLAY_STALE"); }
      return { ...receipt.result, replayed: true };
    }
    if (ctx.project.revision !== expected) return fail("PRECONDITION_FAILED", 412);
    const response = await work(ctx, body);
    const project = await ctx.tx.project.findUniqueOrThrow({ where: { id: ctx.project.id } });
    await ctx.tx.$executeRaw`INSERT INTO registry_private.release_receipts(project_id,actor_id,idempotency_key,action,body_hash,authz_epoch,result)
      VALUES(${args.projectId}::uuid,${actor.id}::uuid,${args.idempotencyKey},${action},${bodyHash},${project.authzEpoch},${JSON.stringify(response)}::jsonb)`;
    return { ...response, replayed: false };
  });
}
async function withdrawn(ctx: Context, releaseId: string) {
  const rows = await ctx.tx.$queryRaw<{ release_id: string }[]>`SELECT release_id FROM registry_private.release_withdrawals WHERE project_id=${ctx.project.id}::uuid AND release_id=${releaseId}::uuid`;
  return rows.length > 0;
}
export async function getRegistryReleaseHead(input: ReadInput) {
  enabled(); const args = parse(readInput, input), actor = await authenticate(args.accessToken);
  return transaction(actor, args.projectId, "READ_RELEASE", async ctx => ({ result: { projectId: ctx.project.id,
    currentReleaseId: ctx.project.currentReleaseId, visibility: ctx.project.visibility }, etag: releaseETag(ctx.project) }));
}
const requestInput = z.object({ versionId: uuid, expectedContentHash: hash, intent: z.enum(["PUBLISH", "ROLLBACK"]), targetReleaseId: uuid.optional() }).strict()
  .refine(value => (value.intent === "ROLLBACK") === Boolean(value.targetReleaseId));
export async function requestRegistryReleaseApproval(input: WriteInput) {
  return mutate("REQUEST_RELEASE", input, requestInput, async (ctx, raw) => {
    const body = parse(requestInput, raw), { content, bindings } = await versionContent(ctx, body.versionId, body.expectedContentHash);
    if (body.targetReleaseId) {
      const target = await releaseFor(ctx, body.targetReleaseId);
      if (target.id === ctx.project.currentReleaseId || target.version_id !== body.versionId) return fail("APPROVAL_INVALID");
    }
    const expires = new Date((await clock(ctx)).getTime() + 15 * 60 * 1000);
    const [request] = await ctx.tx.$queryRaw<{ id: string }[]>`INSERT INTO registry_private.release_requests
      (project_id,version_id,content_hash,visibility,asset_digest_set,authz_epoch,project_revision,current_release_id,policy_revision,intent,target_release_id,requester_id,expires_at)
      VALUES(${ctx.project.id}::uuid,${body.versionId}::uuid,${body.expectedContentHash},${content.manifest.visibility}::public."ProjectVisibility",
        ${JSON.stringify(bindings)}::jsonb,${ctx.project.authzEpoch},${ctx.project.revision},${ctx.project.currentReleaseId}::uuid,
        ${RELEASE_POLICY_REVISION},${body.intent},${body.targetReleaseId ?? null}::uuid,${ctx.actor.id}::uuid,${expires}) RETURNING id`;
    ctx.deadlines.push(expires);
    return { result: { id: request.id, projectId: ctx.project.id, versionId: body.versionId, state: "PENDING" }, etag: releaseETag(ctx.project) };
  });
}
const approveInput = z.object({ requestId: uuid }).strict();
export async function approveRegistryRelease(input: WriteInput) {
  return mutate("APPROVE_RELEASE", input, approveInput, async (ctx, raw) => {
    const request = await requestFor(ctx, parse(approveInput, raw).requestId);
    if (request.requester_id === ctx.actor.id) return fail("FORBIDDEN", 403);
    await freshness(ctx, request);
    const [approval] = await ctx.tx.$queryRaw<{ id: string }[]>`INSERT INTO registry_private.release_approvals(project_id,request_id,reviewer_id)
      VALUES(${ctx.project.id}::uuid,${request.id}::uuid,${ctx.actor.id}::uuid) RETURNING id`;
    return { result: { id: approval.id, projectId: ctx.project.id, versionId: request.version_id, state: "APPROVED" }, etag: releaseETag(ctx.project) };
  });
}
const publishInput = z.object({ approvalId: uuid }).strict();
async function publish(action: "PUBLISH_RELEASE" | "ROLLBACK_RELEASE", input: WriteInput) {
  return mutate(action, input, publishInput, async (ctx, raw) => {
    const approval = await approvalFor(ctx, parse(publishInput, raw).approvalId), request = await requestFor(ctx, approval.request_id);
    if (request.intent !== (action === "ROLLBACK_RELEASE" ? "ROLLBACK" : "PUBLISH") || request.requester_id !== ctx.actor.id) return fail("APPROVAL_INVALID");
    await freshness(ctx, request, approval);
    const [release] = await ctx.tx.$queryRaw<{ id: string }[]>`INSERT INTO public.project_releases
      (id,project_id,version_id,visibility_at_approval,content_hash,published_at,authorization_id,published_by)
      VALUES(gen_random_uuid(),${ctx.project.id}::uuid,${request.version_id}::uuid,${request.visibility}::public."ProjectVisibility",
        ${request.content_hash},clock_timestamp(),${approval.id}::uuid,${ctx.actor.id}::uuid) RETURNING id`;
    const project = await ctx.tx.project.update({ where: { id: ctx.project.id }, data: { currentReleaseId: release.id, visibility: request.visibility as "PRIVATE" | "PUBLIC" | "UNLISTED" } });
    return { result: { id: release.id, projectId: ctx.project.id, versionId: request.version_id, state: "PUBLISHED" }, etag: releaseETag(project) };
  });
}
export async function publishRegistryRelease(input: WriteInput) { return publish("PUBLISH_RELEASE", input); }
export async function rollbackRegistryRelease(input: WriteInput) { return publish("ROLLBACK_RELEASE", input); }
const withdrawInput = z.object({ releaseId: uuid }).strict();
export async function withdrawRegistryRelease(input: WriteInput) {
  return mutate("WITHDRAW_RELEASE", input, withdrawInput, async (ctx, raw) => {
    const release = await releaseFor(ctx, parse(withdrawInput, raw).releaseId);
    if (await withdrawn(ctx, release.id)) return fail("CONFLICT");
    await ctx.tx.$executeRaw`INSERT INTO registry_private.release_withdrawals(release_id,project_id,actor_id)
      VALUES(${release.id}::uuid,${ctx.project.id}::uuid,${ctx.actor.id}::uuid)`;
    // Also advance revision when withdrawing a historical release; approvals
    // cannot survive changes to the release history they were issued against.
    const project = await ctx.tx.project.update({ where: { id: ctx.project.id }, data: ctx.project.currentReleaseId === release.id
      ? { currentReleaseId: null, visibility: "PRIVATE", authzEpoch: { increment: 1 } } : { authzEpoch: { increment: 1 } } });
    return { result: { id: release.id, projectId: ctx.project.id, versionId: release.version_id, state: "WITHDRAWN" }, etag: releaseETag(project) };
  });
}

/** No projection or delivery path exists until bytes, sanitation and ACLs are verified. */
export async function getPublicRegistryRelease(_input: unknown): Promise<never> { void _input; return fail("NOT_FOUND", 404); }
