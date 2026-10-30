import "server-only";

import { createClient } from "@supabase/supabase-js";
import { Prisma, type Project, type ProjectDraft, type PublicationReview } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { canonicalHash, HASH_ALGORITHM, hashSnapshot } from "./canonical";
import { collectAssetReferences, draftDTOSchema, parseDraftPayload, validateDraftPayload, versionDTOSchema, type DraftDTO, type DraftPayload } from "./contracts";

export const REGISTRY_POLICY_REVISION = 1;
const REVIEW_TTL_MS = 15 * 60 * 1000;
type Tx = Prisma.TransactionClient;
type Action = "READ_DRAFT" | "EDIT_DRAFT" | "SUBMIT_REVIEW" | "WITHDRAW_REVIEW" | "DECIDE_REVIEW" | "SEAL_VERSION";
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const readInput = z.object({ accessToken: z.string().min(1).max(16384), projectId: uuid }).strict();
const writeInput = readInput.extend({ ifMatch: z.string().max(100).optional(), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), input: z.unknown() }).strict();
type WriteInput = z.input<typeof writeInput>;
type ReadInput = z.input<typeof readInput>;
type Principal = { id: string; session: string; exp: number };
type Context = { tx: Tx; project: Project; actor: Principal; trackReview: boolean;
  parties: Map<string, { subject: string; action: Action; roles: string[] }>; deadlines: Date[] };
type Response<T> = { result: T; etag: string };
export type CommandResponse<T> = Response<T> & { replayed: boolean };

export class RegistryProtocolError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); this.name = "RegistryProtocolError"; }
}
function fail(code: string, status = 409): never { throw new RegistryProtocolError(code, status); }
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); } catch { return fail("INVALID_INPUT", 422); }
}
function enabled() {
  if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true" || process.env.REGISTRY_DRAFT_REVIEW_ENABLED !== "true") fail("DISABLED", 403);
}
async function authenticate(token: string): Promise<Principal> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return fail("UNAVAILABLE", 503);
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) }) },
  });
  try {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return fail("AUTH_REQUIRED", 401);
    // Decoding is allowed only AFTER Auth verified the signature. No JWT role,
    // metadata, owner or caller-provided subject participates in authorization.
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const verified = parse(z.object({ sub: uuid, session_id: uuid, exp: z.number().int().positive() }), claims);
    if (verified.sub !== data.user.id) return fail("AUTH_REQUIRED", 401);
    return { id: data.user.id, session: verified.session_id, exp: verified.exp };
  } catch { return fail("AUTH_REQUIRED", 401); }
}
const roles: Record<Action, string[]> = {
  READ_DRAFT: ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"],
  EDIT_DRAFT: ["OWNER", "EDITOR"], SUBMIT_REVIEW: ["OWNER", "EDITOR"],
  WITHDRAW_REVIEW: ["OWNER", "EDITOR"], DECIDE_REVIEW: ["REVIEWER"], SEAL_VERSION: ["OWNER", "EDITOR"],
};
async function session(tx: Tx, actor: Principal) {
  const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auth.sessions
    WHERE id=${actor.session}::uuid AND user_id=${actor.id}::uuid
      AND (not_after IS NULL OR not_after>clock_timestamp()) AND to_timestamp(${actor.exp})>clock_timestamp() FOR SHARE`;
  if (found.length !== 1) fail("AUTH_REQUIRED", 401);
}
async function qualification(tx: Tx, subject: string, action: Action) {
  const operators = await tx.$queryRaw<{ subject_id: string }[]>`SELECT subject_id FROM registry_private.internal_operators
    WHERE subject_id=${subject}::uuid AND active AND expires_at>clock_timestamp() FOR SHARE`;
  const actions = await tx.$queryRaw<{ subject_id: string }[]>`SELECT subject_id FROM registry_private.operator_actions
    WHERE subject_id=${subject}::uuid AND action=${action} AND active AND expires_at>clock_timestamp() FOR SHARE`;
  if (operators.length !== 1 || actions.length !== 1) fail("FORBIDDEN", 403);
}
async function member(tx: Tx, projectId: string, subject: string, action: Action) {
  const rows = await tx.$queryRaw<{ roles: string[] }[]>`SELECT roles FROM public.project_memberships
    WHERE project_id=${projectId}::uuid AND subject_id=${subject}::uuid AND active FOR SHARE`;
  if (rows.length !== 1 || !rows[0].roles.some(role => roles[action].includes(role))) fail("NOT_FOUND", 404);
}
async function authority(ctx: Context, subject: string, action: Action) {
  await qualification(ctx.tx, subject, action); await member(ctx.tx, ctx.project.id, subject, action);
  if (ctx.trackReview || subject === ctx.actor.id) ctx.parties.set(`${subject}:${action}`, { subject, action, roles: roles[action] });
}
async function finalFreshness(ctx: Context) {
  // One materialized database clock defines the command's final validation
  // instant after ALL effects and the response receipt have been written.
  const [valid] = await ctx.tx.$queryRaw<{ session_valid: boolean; authorizations_valid: boolean; reviews_valid: boolean }[]>`
    WITH tick AS MATERIALIZED (SELECT clock_timestamp() AS at)
    SELECT EXISTS(SELECT 1 FROM auth.sessions s,tick WHERE s.id=${ctx.actor.session}::uuid AND s.user_id=${ctx.actor.id}::uuid
      AND (s.not_after IS NULL OR s.not_after>tick.at) AND to_timestamp(${ctx.actor.exp})>tick.at) AS session_valid,
      NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(${JSON.stringify([...ctx.parties.values()])}::jsonb) AS v(subject uuid,action text,roles text[]),tick
        WHERE NOT EXISTS(SELECT 1 FROM registry_private.internal_operators o WHERE o.subject_id=v.subject AND o.active AND o.expires_at>tick.at)
          OR NOT EXISTS(SELECT 1 FROM registry_private.operator_actions a WHERE a.subject_id=v.subject AND a.action=v.action AND a.active AND a.expires_at>tick.at)
          OR NOT EXISTS(SELECT 1 FROM public.project_memberships m WHERE m.project_id=${ctx.project.id}::uuid AND m.subject_id=v.subject
            AND m.active AND m.roles && v.roles::public."ProjectRole"[])) AS authorizations_valid,
      NOT EXISTS(SELECT 1 FROM unnest(${ctx.deadlines.map(date => date.toISOString())}::timestamptz[]) expiry,tick WHERE expiry<=tick.at) AS reviews_valid`;
  if (!valid.session_valid) fail("AUTH_REQUIRED", 401);
  if (!valid.authorizations_valid) fail("FORBIDDEN", 403);
  if (!valid.reviews_valid) fail("REVIEW_INVALID");
}
function retryable(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string } };
  return e.code === "P2034" || ["40001", "40P01"].includes(e.meta?.code ?? "");
}
async function transaction<T>(actor: Principal, projectId: string, action: Action, work: (ctx: Context) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await session(tx, actor); await qualification(tx, actor.id, action);
        const projects = await tx.$queryRaw<Project[]>`SELECT id,slug,owner_id AS "ownerId",visibility,archived_at AS "archivedAt",
          current_release_id AS "currentReleaseId",authz_epoch AS "authzEpoch",revision,created_at AS "createdAt",updated_at AS "updatedAt"
          FROM public.projects WHERE id=${projectId}::uuid FOR UPDATE`;
        if (projects.length !== 1 || projects[0].archivedAt) return fail("NOT_FOUND", 404);
        const ctx: Context = { tx, actor, project: projects[0], trackReview: action !== "READ_DRAFT", parties: new Map(), deadlines: [] };
        await member(tx, projectId, actor.id, action);
        ctx.parties.set(`${actor.id}:${action}`, { subject: actor.id, action, roles: roles[action] });
        const result = await work(ctx);
        // Locks serialize explicit revocation; wall-clock checks also catch
        // qualification or JWT expiry during an otherwise valid transaction.
        await finalFreshness(ctx);
        return result;
      }, { isolationLevel: "Serializable", timeout: 15000, maxWait: 5000 });
    } catch (error) {
      if (error instanceof RegistryProtocolError) throw error;
      if (!retryable(error)) {
        const code = (error as { code?: string }).code ?? "";
        // No ORM messages, SQL, credentials or foreign identifiers cross the
        // protocol boundary, including a cross-project document-ID race.
        if (["P2002", "P2003", "P2004", "P2010", "P2025"].includes(code)) return fail("CONFLICT");
        return fail("UNAVAILABLE", 503);
      }
      if (attempt === 2) return fail("CONFLICT");
    }
  }
  return fail("CONFLICT");
}
export function draftETag(draft: Pick<ProjectDraft, "id" | "revision">) { return `"draft:${draft.id}:${draft.revision}"`; }
function precondition(value: string | undefined) {
  if (!value) return fail("PRECONDITION_REQUIRED", 428);
  const match = /^"draft:([0-9a-f-]{36}):([1-9][0-9]*)"$/.exec(value);
  if (!match || !uuid.safeParse(match[1]).success || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) > 2147483647) return fail("INVALID_INPUT", 422);
  return { id: match[1], revision: Number(match[2]) };
}
function payload(draft: ProjectDraft, project: Project): DraftPayload {
  try { return validateDraftPayload({ manifest: draft.manifest, presentation: draft.presentation, documentation: draft.documentation }, { projectId: project.id, slug: project.slug }); }
  catch { return fail("DRAFT_UNINITIALIZED"); }
}
function draftDTO(draft: ProjectDraft, project: Project): DraftDTO {
  return draftDTOSchema.parse({ id: draft.id, projectId: draft.projectId, revision: draft.revision, state: draft.state, payload: payload(draft, project) });
}
async function activeDraft(ctx: Context) {
  const draft = await ctx.tx.projectDraft.findFirst({ where: { projectId: ctx.project.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!draft) return fail("NOT_FOUND", 404);
  return draft;
}
async function read<T>(input: ReadInput, work: (ctx: Context) => Promise<T>) {
  enabled(); const args = parse(readInput, input); const actor = await authenticate(args.accessToken);
  return transaction(actor, args.projectId, "READ_DRAFT", work);
}
export async function getRegistryDraftHead(input: ReadInput) {
  return read(input, async ctx => { const d = await activeDraft(ctx); return { result: { id: d.id, projectId: d.projectId, revision: d.revision, state: d.state }, etag: draftETag(d) }; });
}
export async function getRegistryDraft(input: ReadInput) {
  return read(input, async ctx => { const d = await activeDraft(ctx); return { result: draftDTO(d, ctx.project), etag: draftETag(d) }; });
}
async function mutate<T>(action: Action, input: WriteInput, inputSchema: z.ZodType, work: (ctx: Context, d: ProjectDraft, body: unknown) => Promise<Response<T>>): Promise<CommandResponse<T>> {
  enabled(); const args = parse(writeInput, input); const expected = precondition(args.ifMatch);
  const body = parse(inputSchema, args.input); const actor = await authenticate(args.accessToken);
  let bodyHash: string;
  try { bodyHash = canonicalHash({ action, projectId: args.projectId, ifMatch: args.ifMatch, input: body }); }
  catch { return fail("INVALID_INPUT", 422); }
  return transaction(actor, args.projectId, action, async ctx => {
    const receipts = await ctx.tx.$queryRaw<{ action: string; body_hash: string; authz_epoch: number; result: Response<T> }[]>`
      SELECT action,body_hash,authz_epoch,result FROM registry_private.command_receipts
      WHERE project_id=${args.projectId}::uuid AND actor_id=${actor.id}::uuid AND idempotency_key=${args.idempotencyKey}`;
    if (receipts.length) {
      const receipt = receipts[0];
      if (receipt.action !== action || receipt.body_hash !== bodyHash) return fail("IDEMPOTENCY_CONFLICT");
      if (receipt.authz_epoch !== ctx.project.authzEpoch) return fail("REPLAY_STALE");
      if (action === "SUBMIT_REVIEW" || action === "DECIDE_REVIEW") {
        const id = (receipt.result.result as { id: string }).id;
        const review = await ctx.tx.publicationReview.findFirst({ where: { id, projectId: ctx.project.id } });
        const draft = review && await ctx.tx.projectDraft.findUnique({ where: { id: review.draftId } });
        if (!review || !draft) return fail("REPLAY_STALE");
        try { await freshness(ctx, draft, review, review.snapshotHash, review.decision === "APPROVED" || review.decision === "REJECTED"); }
        catch (error) { if (!(error instanceof RegistryProtocolError)) throw error; return fail("REPLAY_STALE"); }
      }
      return { ...receipt.result, replayed: true };
    }
    const d = await ctx.tx.projectDraft.findFirst({ where: { id: expected.id, projectId: args.projectId } });
    if (!d) return fail("NOT_FOUND", 404);
    if (d.revision !== expected.revision) return fail("PRECONDITION_FAILED", 412);
    const response = await work(ctx, d, body);
    await ctx.tx.$executeRaw`INSERT INTO registry_private.command_receipts
      (project_id,actor_id,idempotency_key,action,body_hash,expected_revision,authz_epoch,result)
      VALUES(${args.projectId}::uuid,${actor.id}::uuid,${args.idempotencyKey},${action},${bodyHash},${expected.revision},${ctx.project.authzEpoch},${JSON.stringify(response)}::jsonb)`;
    return { ...response, replayed: false };
  });
}
type AssetBinding = { assetId: string; sourceDigest: string; deliveryDigest: string; scanRevision: number; mime: string; size: number; dataClass: string; rightsHash: string };
async function assets(ctx: Context, content: DraftPayload): Promise<AssetBinding[]> {
  const references = collectAssetReferences(content), ids = [...new Set(references.map(ref => ref.id))].sort();
  if (!ids.length) return [];
  const rows = await ctx.tx.$queryRaw<{ id: string; source_digest: string; delivery_digest: string | null; scan_revision: number; mime: string; size: number; data_class: string; rights_ref: string; provenance: Prisma.JsonValue; state: string }[]>`
    SELECT id,source_digest,delivery_digest,scan_revision,mime,size,data_class,rights_ref,provenance,state
    FROM public.project_assets WHERE project_id=${ctx.project.id}::uuid AND id=ANY(${ids}::uuid[]) ORDER BY id FOR SHARE`;
  if (rows.length !== ids.length) return fail("REVIEW_INVALID");
  return rows.map(asset => {
    if (asset.state !== "APPROVED" || !asset.delivery_digest || asset.data_class !== "CURATED" || !asset.rights_ref.trim()
      || !["text/markdown", "image/png", "image/jpeg", "image/webp"].includes(asset.mime)
      || references.some(ref => ref.id === asset.id && (ref.usage === "markdown" ? asset.mime !== "text/markdown" : ref.usage === "image" && !asset.mime.startsWith("image/")))) return fail("REVIEW_INVALID");
    return { assetId: asset.id, sourceDigest: asset.source_digest, deliveryDigest: asset.delivery_digest, scanRevision: asset.scan_revision,
      mime: asset.mime, size: asset.size, dataClass: asset.data_class, rightsHash: canonicalHash({ rights: asset.rights_ref, provenance: asset.provenance }) };
  });
}
async function invalidated(ctx: Context, reviewId: string) {
  const rows = await ctx.tx.$queryRaw<{ review_id: string }[]>`SELECT review_id FROM registry_private.review_invalidations WHERE review_id=${reviewId}::uuid`;
  return rows.length > 0;
}
async function reviewFor(ctx: Context, d: ProjectDraft, id: string) {
  const review = await ctx.tx.publicationReview.findFirst({ where: { id, projectId: ctx.project.id, draftId: d.id } });
  if (!review) return fail("NOT_FOUND", 404);
  return review;
}
async function freshness(ctx: Context, d: ProjectDraft, review: PublicationReview, expectedHash: string, withReviewer = false) {
  const [clock] = await ctx.tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  if (d.state !== "IN_REVIEW" || d.revision !== review.draftRevision || review.authzEpoch !== ctx.project.authzEpoch
    || review.policyRevision !== REGISTRY_POLICY_REVISION || review.expiresAt <= clock.now || await invalidated(ctx, review.id)) return fail("REVIEW_INVALID");
  if (ctx.trackReview) ctx.deadlines.push(review.expiresAt);
  const content = payload(d, ctx.project), digest = hashSnapshot(content);
  if (digest !== review.snapshotHash || digest !== expectedHash) return fail("HASH_MISMATCH");
  const bindings = await assets(ctx, content);
  if (canonicalHash(bindings) !== canonicalHash(review.assetDigestSet)) return fail("REVIEW_INVALID");
  await authority(ctx, review.submitterId, "SUBMIT_REVIEW");
  if (withReviewer) {
    if (!review.reviewerId || review.reviewerId === review.submitterId) return fail("REVIEW_INVALID");
    await authority(ctx, review.reviewerId, "DECIDE_REVIEW");
  }
  return { content, bindings };
}
function reviewDTO(review: PublicationReview, effectiveState: PublicationReview["decision"] | "SEALED" = review.decision) {
  return { id: review.id, projectId: review.projectId, draftId: review.draftId, draftRevision: review.draftRevision,
    decision: review.decision, effectiveState, contentHash: review.snapshotHash, expiresAt: review.expiresAt.toISOString() };
}
async function invalidateDraft(ctx: Context, d: ProjectDraft, reason: "DRAFT_EDITED" | "WITHDRAWN") {
  await ctx.tx.$executeRaw`INSERT INTO registry_private.review_invalidations(review_id,project_id,actor_id,reason)
    SELECT id,project_id,${ctx.actor.id}::uuid,${reason} FROM public.publication_reviews WHERE project_id=${ctx.project.id}::uuid AND draft_id=${d.id}::uuid
    ON CONFLICT(review_id) DO NOTHING`;
}
export async function editRegistryDraft(input: WriteInput) {
  // Parsing text uses the duplicate-key-aware JSON parser before Zod validation.
  const bodySchema = z.unknown().transform((value, ctx) => {
    try { return parseDraftPayload(value); }
    catch { ctx.addIssue({ code: "custom", message: "Invalid draft payload" }); return z.NEVER; }
  });
  return mutate("EDIT_DRAFT", input, bodySchema, async (ctx, d, body) => {
    if (d.state !== "DRAFT") return fail("CONFLICT");
    let content: DraftPayload;
    try { content = validateDraftPayload(body, { projectId: ctx.project.id, slug: ctx.project.slug }); } catch { return fail("INVALID_INPUT", 422); }
    await assets(ctx, content); await invalidateDraft(ctx, d, "DRAFT_EDITED");
    const updated = await ctx.tx.projectDraft.update({ where: { id: d.id }, data: { manifest: content.manifest as Prisma.InputJsonValue,
      presentation: content.presentation as Prisma.InputJsonValue, documentation: content.documentation as Prisma.InputJsonValue, updatedBy: ctx.actor.id } });
    return { result: draftDTO(updated, ctx.project), etag: draftETag(updated) };
  });
}
const expectedHashInput = z.object({ expectedContentHash: hash }).strict();
export async function submitRegistryDraft(input: WriteInput) {
  return mutate("SUBMIT_REVIEW", input, expectedHashInput, async (ctx, d, raw) => {
    const body = parse(expectedHashInput, raw);
    if (d.state !== "DRAFT") return fail("CONFLICT");
    const content = payload(d, ctx.project), digest = hashSnapshot(content);
    if (body.expectedContentHash !== digest) return fail("HASH_MISMATCH");
    const bindings = await assets(ctx, content);
    const submitted = await ctx.tx.projectDraft.update({ where: { id: d.id }, data: { state: "IN_REVIEW", updatedBy: ctx.actor.id } });
    const [clock] = await ctx.tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const review = await ctx.tx.publicationReview.create({ data: { projectId: ctx.project.id, draftId: d.id, draftRevision: submitted.revision,
      authzEpoch: ctx.project.authzEpoch, snapshotHash: digest, visibility: content.manifest.visibility, assetDigestSet: bindings,
      submitterId: ctx.actor.id, policyRevision: REGISTRY_POLICY_REVISION, expiresAt: new Date(clock.now.getTime() + REVIEW_TTL_MS) } });
    ctx.deadlines.push(review.expiresAt);
    return { result: reviewDTO(review), etag: draftETag(submitted) };
  });
}
const reviewIdInput = z.object({ reviewId: uuid }).strict();
export async function withdrawRegistryReview(input: WriteInput) {
  return mutate("WITHDRAW_REVIEW", input, reviewIdInput, async (ctx, d, raw) => {
    const { reviewId } = parse(reviewIdInput, raw), review = await reviewFor(ctx, d, reviewId);
    if (d.state !== "IN_REVIEW") return fail("CONFLICT");
    await invalidateDraft(ctx, d, "WITHDRAWN");
    const updated = await ctx.tx.projectDraft.update({ where: { id: d.id }, data: { state: "DRAFT", updatedBy: ctx.actor.id } });
    return { result: reviewDTO(review, "INVALIDATED"), etag: draftETag(updated) };
  });
}
const decisionInput = z.object({ reviewId: uuid, decision: z.enum(["APPROVED", "REJECTED"]), expectedContentHash: hash }).strict();
export async function decideRegistryReview(input: WriteInput) {
  return mutate("DECIDE_REVIEW", input, decisionInput, async (ctx, d, raw) => {
    const body = parse(decisionInput, raw), review = await reviewFor(ctx, d, body.reviewId);
    if (review.submitterId === ctx.actor.id) return fail("FORBIDDEN", 403);
    if (review.decision !== "PENDING") return fail("CONFLICT");
    await freshness(ctx, d, review, body.expectedContentHash);
    const [clock] = await ctx.tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const decided = await ctx.tx.publicationReview.update({ where: { id: review.id }, data: { decision: body.decision, reviewerId: ctx.actor.id, decidedAt: clock.now } });
    await freshness(ctx, d, decided, body.expectedContentHash, true);
    return { result: reviewDTO(decided), etag: draftETag(d) };
  });
}
const sealInput = z.object({ reviewId: uuid, expectedContentHash: hash }).strict();
export async function sealRegistryVersion(input: WriteInput) {
  return mutate("SEAL_VERSION", input, sealInput, async (ctx, d, raw) => {
    const body = parse(sealInput, raw), review = await reviewFor(ctx, d, body.reviewId);
    if (review.decision !== "APPROVED") return fail("REVIEW_INVALID");
    const { content, bindings } = await freshness(ctx, d, review, body.expectedContentHash, true);
    if (await ctx.tx.projectVersion.findUnique({ where: { projectId_version: { projectId: ctx.project.id, version: content.manifest.version } } })) return fail("CONFLICT");
    if (await ctx.tx.projectDocumentation.count({ where: { id: { in: content.documentation.map(doc => doc.id) } } })) return fail("CONFLICT");
    const version = await ctx.tx.projectVersion.create({ data: { projectId: ctx.project.id, version: content.manifest.version,
      snapshot: content as Prisma.InputJsonValue, contentHash: review.snapshotHash, hashAlgorithm: HASH_ALGORITHM, reviewId: review.id } });
    for (const doc of content.documentation) {
      const asset = bindings.find(binding => binding.assetId === doc.assetId.toLowerCase())!;
      await ctx.tx.projectDocumentation.create({ data: { id: doc.id, projectId: ctx.project.id, versionId: version.id, title: doc.title,
        language: doc.language, assetId: doc.assetId, contentHash: asset.deliveryDigest } });
    }
    await freshness(ctx, d, review, body.expectedContentHash, true);
    // B1's PUBLISHED draft state means frozen/sealed, not a public Release.
    const frozen = await ctx.tx.projectDraft.update({ where: { id: d.id }, data: { state: "PUBLISHED", updatedBy: ctx.actor.id } });
    const dto = versionDTOSchema.parse({ id: version.id, projectId: version.projectId, version: version.version,
      snapshot: version.snapshot, contentHash: version.contentHash, hashAlgorithm: version.hashAlgorithm, reviewId: version.reviewId, createdAt: version.createdAt.toISOString() });
    return { result: dto, etag: draftETag(frozen) };
  });
}
export async function getRegistryReview(input: ReadInput & { reviewId: string }) {
  enabled(); const args = parse(readInput.extend({ reviewId: uuid }).strict(), input); const actor = await authenticate(args.accessToken);
  return transaction(actor, args.projectId, "READ_DRAFT", async ctx => {
    const review = await ctx.tx.publicationReview.findFirst({ where: { id: args.reviewId, projectId: args.projectId } });
    if (!review) return fail("NOT_FOUND", 404);
    const draft = await ctx.tx.projectDraft.findUniqueOrThrow({ where: { id: review.draftId } });
    let effective: PublicationReview["decision"] | "SEALED" = review.decision;
    const version = await ctx.tx.projectVersion.findFirst({ where: { reviewId: review.id, projectId: ctx.project.id } });
    if (await invalidated(ctx, review.id)) effective = "INVALIDATED";
    else if (version && draft.state === "PUBLISHED" && review.decision === "APPROVED") {
      // A sealed immutable version is an audit fact. It is not a live publish
      // authorization; B2-B must independently recheck all publication policy.
      try {
        versionDTOSchema.parse({ ...version, createdAt: version.createdAt.toISOString() });
        effective = version.contentHash === review.snapshotHash ? "SEALED" : "INVALIDATED";
      } catch { effective = "INVALIDATED"; }
    } else {
      try { await freshness(ctx, draft, review, review.snapshotHash, review.decision === "APPROVED"); }
      catch (error) { if (!(error instanceof RegistryProtocolError)) throw error; effective = "INVALIDATED"; }
    }
    return { result: reviewDTO(review, effective), etag: draftETag(draft) };
  });
}
