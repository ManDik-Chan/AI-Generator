import "server-only";

import { z } from "zod";
import { versionDTOSchema } from "./contracts";
import { getRegistryReviewInContext, readRegistryDraftTransaction } from "./protocol";
import { releaseETag } from "./release";
import { REGISTRY_ACTION_ROLES, reviewDTOSchema } from "./read-contracts";
import { pageSchema, projectReadDTOSchema, projectSummaryDTOSchema, qualificationsDTOSchema,
  releaseHeadReadDTOSchema, releaseRecordDTOSchema, releaseRequestDTOSchema, type QualificationDTO } from "./query-contracts";
import { authorizeProject, enabledRead, pageInput, parse, projectInput, readTransaction, tokenInput, type ReadContext } from "./read-context";
import { fail, RELEASE_POLICY_REVISION } from "./release-context";

type ProjectInput = z.input<typeof projectInput>;
type PageInput = z.input<typeof pageInput>;
const projectPageInput = projectInput.extend(pageInput.shape).strict();
const globalPageInput = tokenInput.extend(pageInput.shape).strict();
const summary = (project: Awaited<ReturnType<typeof authorizeProject>>) => projectSummaryDTOSchema.parse({
  id: project.id, slug: project.slug, visibility: project.visibility, roles: project.roles,
});
function page<T extends { id: string }>(items: T[], limit: number) {
  return { items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null };
}
async function qualifications(ctx: ReadContext): Promise<QualificationDTO[]> {
  const rows = await ctx.tx.$queryRaw<{ action: string; expiresAt: Date }[]>`SELECT a.action,least(a.expires_at,o.expires_at) AS "expiresAt"
    FROM registry_private.operator_actions a JOIN registry_private.internal_operators o USING(subject_id)
    WHERE a.subject_id=${ctx.actor.id}::uuid AND a.active AND o.active
      AND a.expires_at>clock_timestamp() AND o.expires_at>clock_timestamp() ORDER BY a.action FOR SHARE OF a,o`;
  ctx.deadlines.push(...rows.map(row => row.expiresAt));
  return qualificationsDTOSchema.parse({ actions: rows.map(row => ({ action: row.action, expiresAt: row.expiresAt.toISOString() })) }).actions;
}

/** The global action list describes only this caller; project role intersection is separate. */
export async function getRegistryQualifications(input: z.input<typeof tokenInput>) {
  const args = parse(tokenInput, input);
  return readTransaction(args.accessToken, "READ_DRAFT", async ctx => ({ result: { actions: await qualifications(ctx) } }));
}
export async function listRegistryProjects(input: z.input<typeof tokenInput> & PageInput) {
  const args = parse(globalPageInput, input);
  return readTransaction(args.accessToken, "READ_DRAFT", async ctx => {
    const candidates = await ctx.tx.project.findMany({ where: { archivedAt: null, ...(args.after ? { id: { gt: args.after } } : {}),
      memberships: { some: { subjectId: ctx.actor.id, active: true, roles: { isEmpty: false } } } },
      select: { id: true }, orderBy: { id: "asc" }, take: args.limit + 1 });
    const rows = [];
    for (const candidate of candidates) rows.push(summary(await authorizeProject(ctx, candidate.id)));
    return { result: pageSchema(projectSummaryDTOSchema).parse(page(rows, args.limit)) };
  });
}
export async function getRegistryProject(input: ProjectInput) {
  const args = parse(projectInput, input);
  return readTransaction(args.accessToken, "READ_DRAFT", async ctx => {
    const project = await authorizeProject(ctx, args.projectId), actions = await qualifications(ctx);
    const effectiveActions = actions.filter(({ action }) => project.roles.some(role => (REGISTRY_ACTION_ROLES[action] as readonly string[]).includes(role)));
    return { result: projectReadDTOSchema.parse({ ...summary(project), effectiveActions }) };
  });
}
function versionDTO(row: { id: string; projectId: string; version: string; snapshot: unknown; contentHash: string;
  hashAlgorithm: string; reviewId: string; createdAt: Date }) {
  return versionDTOSchema.parse({ id: row.id, projectId: row.projectId, version: row.version, snapshot: row.snapshot,
    contentHash: row.contentHash, hashAlgorithm: row.hashAlgorithm, reviewId: row.reviewId, createdAt: row.createdAt.toISOString() });
}
export async function listRegistryVersions(input: ProjectInput & PageInput) {
  const args = parse(projectPageInput, input);
  return readTransaction(args.accessToken, "READ_DRAFT", async ctx => {
    await authorizeProject(ctx, args.projectId);
    const rows = await ctx.tx.projectVersion.findMany({ where: { projectId: args.projectId, ...(args.after ? { id: { gt: args.after } } : {}) },
      orderBy: { id: "asc" }, take: args.limit + 1 });
    return { result: pageSchema(versionDTOSchema).parse(page(rows.map(versionDTO), args.limit)) };
  });
}
export async function getRegistryVersion(input: ProjectInput & { versionId: string }) {
  const args = parse(projectInput.extend({ versionId: z.string().uuid() }).strict(), input);
  return readTransaction(args.accessToken, "READ_DRAFT", async ctx => {
    await authorizeProject(ctx, args.projectId);
    const row = await ctx.tx.projectVersion.findFirst({ where: { id: args.versionId, projectId: args.projectId } });
    if (!row) fail("NOT_FOUND", 404);
    return { result: versionDTO(row) };
  });
}
export async function listRegistryReviews(input: ProjectInput & PageInput & { draftId: string }) {
  enabledRead();
  const args = parse(projectPageInput.extend({ draftId: z.string().uuid() }).strict(), input);
  // Reuse the original review effectiveness calculation, locks and final checks.
  return readRegistryDraftTransaction({ accessToken: args.accessToken, projectId: args.projectId }, async ctx => {
    if (!await ctx.tx.projectDraft.findFirst({ where: { id: args.draftId, projectId: args.projectId }, select: { id: true } })) fail("NOT_FOUND", 404);
    const rows = await ctx.tx.publicationReview.findMany({ where: { projectId: args.projectId, draftId: args.draftId,
      ...(args.after ? { id: { gt: args.after } } : {}) }, orderBy: { id: "asc" }, take: args.limit + 1 });
    const dtos = [];
    for (const row of rows) dtos.push((await getRegistryReviewInContext(ctx, row)).result);
    return { result: pageSchema(reviewDTOSchema).parse(page(dtos, args.limit)) };
  });
}
export async function getRegistryReadReleaseHead(input: ProjectInput) {
  const args = parse(projectInput, input);
  return readTransaction(args.accessToken, "READ_RELEASE", async ctx => {
    const p = await authorizeProject(ctx, args.projectId);
    return { result: releaseHeadReadDTOSchema.parse({ projectId: p.id, currentReleaseId: p.currentReleaseId, visibility: p.visibility }), etag: releaseETag(p) };
  });
}
export async function listRegistryReleaseHistory(input: ProjectInput & PageInput) {
  const args = parse(projectPageInput, input);
  return readTransaction(args.accessToken, "READ_RELEASE", async ctx => {
    await authorizeProject(ctx, args.projectId);
    const rows = await ctx.tx.$queryRaw<{ id: string; projectId: string; versionId: string; version: string; contentHash: string;
      visibilityAtApproval: string; publishedAt: Date; withdrawnAt: Date | null; intent: string | null }[]>`
      SELECT r.id,r.project_id AS "projectId",r.version_id AS "versionId",v.version,r.content_hash AS "contentHash",
        r.visibility_at_approval AS "visibilityAtApproval",r.published_at AS "publishedAt",coalesce(w.created_at,r.withdrawn_at) AS "withdrawnAt",q.intent
      FROM public.project_releases r JOIN public.project_versions v ON v.id=r.version_id AND v.project_id=r.project_id
      LEFT JOIN registry_private.release_withdrawals w ON w.release_id=r.id AND w.project_id=r.project_id
      LEFT JOIN registry_private.release_approvals a ON a.id=r.authorization_id AND a.project_id=r.project_id
      LEFT JOIN registry_private.release_requests q ON q.id=a.request_id AND q.project_id=r.project_id
      WHERE r.project_id=${args.projectId}::uuid AND (${args.after ?? null}::uuid IS NULL OR r.id>${args.after ?? null}::uuid)
      ORDER BY r.id ASC LIMIT ${args.limit + 1}`;
    const dtos = rows.map(r => releaseRecordDTOSchema.parse({ ...r, state: r.withdrawnAt ? "WITHDRAWN" : "PUBLISHED",
      publishedAt: r.publishedAt.toISOString(), withdrawnAt: r.withdrawnAt?.toISOString() ?? null }));
    return { result: pageSchema(releaseRecordDTOSchema).parse(page(dtos, args.limit)) };
  });
}
export async function listRegistryReleaseRequests(input: ProjectInput & PageInput) {
  const args = parse(projectPageInput, input);
  return readTransaction(args.accessToken, "READ_RELEASE", async ctx => {
    await authorizeProject(ctx, args.projectId);
    const rows = await ctx.tx.$queryRaw<{ id: string; projectId: string; versionId: string; version: string; contentHash: string;
      intent: string; targetReleaseId: string | null; visibility: string; expiresAt: Date; approvalId: string | null;
      state: string; expired: boolean; stale: boolean; requestedByViewer: boolean; approvedByViewer: boolean }[]>`
      SELECT q.id,q.project_id AS "projectId",q.version_id AS "versionId",v.version,q.content_hash AS "contentHash",q.intent,
        q.target_release_id AS "targetReleaseId",q.visibility,q.expires_at AS "expiresAt",a.id AS "approvalId",
        CASE WHEN EXISTS(SELECT 1 FROM public.project_releases r WHERE r.authorization_id=a.id AND r.project_id=q.project_id) THEN 'CONSUMED'
          WHEN a.id IS NOT NULL THEN 'APPROVED' ELSE 'PENDING' END AS state,
        q.expires_at<=clock_timestamp() AS expired,
        (q.authz_epoch<>p.authz_epoch OR q.project_revision<>p.revision OR q.current_release_id IS DISTINCT FROM p.current_release_id OR q.policy_revision<>${RELEASE_POLICY_REVISION}) AS stale,
        q.requester_id=${ctx.actor.id}::uuid AS "requestedByViewer",coalesce(a.reviewer_id=${ctx.actor.id}::uuid,false) AS "approvedByViewer"
      FROM registry_private.release_requests q JOIN public.project_versions v ON v.id=q.version_id AND v.project_id=q.project_id
      JOIN public.projects p ON p.id=q.project_id
      LEFT JOIN registry_private.release_approvals a ON a.request_id=q.id AND a.project_id=q.project_id
      WHERE q.project_id=${args.projectId}::uuid AND (${args.after ?? null}::uuid IS NULL OR q.id>${args.after ?? null}::uuid)
      ORDER BY q.id ASC LIMIT ${args.limit + 1}`;
    const dtos = rows.map(r => releaseRequestDTOSchema.parse({ ...r, expiresAt: r.expiresAt.toISOString() }));
    return { result: pageSchema(releaseRequestDTOSchema).parse(page(dtos, args.limit)) };
  });
}
