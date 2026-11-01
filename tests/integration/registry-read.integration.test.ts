import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

import { canonicalHash, hashSnapshot } from "@/features/registry/canonical";
import { draftDTOSchema, type DraftPayload } from "@/features/registry/contracts";
import { decideRegistryReview, editRegistryDraft, getRegistryDraft, getRegistryDraftHead, getRegistryReview,
  RegistryProtocolError, sealRegistryVersion, submitRegistryDraft } from "@/features/registry/protocol";
import { REGISTRY_ACTION_ROLES, reviewDTOSchema } from "@/features/registry/read-contracts";
import { createRegistryReadHandler } from "@/features/registry/read-http";
import { authorizeProject, readTransaction } from "@/features/registry/read-context";
import { getRegistryProject, getRegistryQualifications, getRegistryReadReleaseHead, getRegistryVersion, listRegistryProjects,
  listRegistryReleaseHistory, listRegistryReleaseRequests, listRegistryReviews, listRegistryVersions } from "@/features/registry/read";
import { approveRegistryRelease, getPublicRegistryRelease, getRegistryReleaseHead, publishRegistryRelease,
  requestRegistryReleaseApproval, withdrawRegistryRelease } from "@/features/registry/release";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real internal-read Auth/database environment required");
if (enabled && ![process.env.TEST_DATABASE_URL!, process.env.SUPABASE_TEST_URL!]
  .every(value => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname))) {
  throw new Error("Registry read acceptance requires loopback-only disposable endpoints");
}

type Actor = { id: string; token: string; sessionId: string; client: SupabaseClient };
type Fixture = { projectId: string; draftId: string; payload: DraftPayload };
const actions = Object.keys(REGISTRY_ACTION_ROLES);
const tables = ["projects", "project_drafts", "project_versions", "project_releases", "project_assets", "project_documentation", "project_memberships", "publication_reviews"];

describe.skipIf(!enabled)("Registry internal read API with real Auth sessions and isolated PostgreSQL", () => {
  let db: PrismaClient, service: SupabaseClient;
  let owner: Actor, reviewer: Actor, viewer: Actor, outsider: Actor;
  const actors: Actor[] = [], projects: string[] = [];
  const client = (key = process.env.SUPABASE_TEST_ANON_KEY!) => createClient(process.env.SUPABASE_TEST_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const access = (actor: Actor, f: Pick<Fixture, "projectId">) => ({ accessToken: actor.token, projectId: f.projectId });
  const command = (actor: Actor, f: Fixture, etag: string, input: unknown, idempotencyKey = randomUUID()) => ({
    ...access(actor, f), ifMatch: etag, idempotencyKey, input,
  });
  async function denied(promise: Promise<unknown>, code: string) {
    try { await promise; throw new Error("Internal read security boundary unexpectedly accepted the operation"); }
    catch (error) {
      expect(error).toBeInstanceOf(RegistryProtocolError);
      expect((error as RegistryProtocolError).code).toBe(code);
      expect((error as Error).message).toBe(code);
    }
  }
  async function createActor(granted = actions, adminMetadata = false): Promise<Actor> {
    const email = `registry-read-${randomUUID()}@example.test`, password = `Aa!${randomUUID()}z9`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true,
      ...(adminMetadata ? { user_metadata: { role: "ADMIN", internal: true, actions }, app_metadata: { role: "ADMIN", internal: true, actions } } : {}) });
    expect(made.error).toBeNull();
    const signed = client(), login = await signed.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const token = login.data.session!.access_token;
    const actor = { id: made.data.user!.id, token, client: signed,
      sessionId: JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).session_id as string };
    actors.push(actor);
    if (adminMetadata) await db.profile.update({ where: { id: actor.id }, data: { role: "ADMIN" } });
    // Base creator status deliberately does not imply any per-action grant.
    await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
      VALUES(${actor.id}::uuid,true,true,clock_timestamp()+interval '1 hour')`;
    for (const action of granted) await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
      VALUES(${actor.id}::uuid,${action},true,clock_timestamp()+interval '1 hour')`;
    return actor;
  }
  async function fixture(projectOwner = owner): Promise<Fixture> {
    const project = await db.project.create({ data: { slug: `read-${randomUUID()}`, ownerId: projectOwner.id } });
    projects.push(project.id);
    for (const [actor, roles] of [[reviewer, ["REVIEWER"]], [viewer, ["VIEWER"]]] as const) {
      if (actor.id !== projectOwner.id) await db.projectMembership.create({ data: { projectId: project.id, subjectId: actor.id, roles: [...roles] } });
    }
    const payload: DraftPayload = {
      manifest: { schemaVersion: "0.5.0", projectId: project.id, slug: project.slug, version: "1.0.0", name: "Internal read fixture",
        summary: "Synthetic isolated read acceptance", category: "software", visibility: "PRIVATE", integration: { mode: "SHOWCASE" },
        capabilities: ["documentation.read"], researchClaims: [] },
      presentation: { schemaVersion: "0.5.0", projectId: project.id, version: "1.0.0", title: "Internal read fixture", sections: [] }, documentation: [],
    };
    const draft = await db.projectDraft.create({ data: { projectId: project.id, updatedBy: projectOwner.id,
      manifest: payload.manifest, presentation: payload.presentation, documentation: payload.documentation } });
    return { projectId: project.id, draftId: draft.id, payload };
  }
  async function seal(f: Fixture) {
    const draft = await getRegistryDraft(access(owner, f)), hash = draft.contentHash;
    const submit = await submitRegistryDraft(command(owner, f, draft.etag, { expectedContentHash: hash }));
    const decide = await decideRegistryReview(command(reviewer, f, submit.etag,
      { reviewId: submit.result.id, decision: "APPROVED", expectedContentHash: hash }));
    const version = await sealRegistryVersion(command(owner, f, decide.etag, { reviewId: submit.result.id, expectedContentHash: hash }));
    return { versionId: version.result.id, reviewId: submit.result.id, contentHash: hash };
  }
  async function releaseRequest(f: Fixture, version: Awaited<ReturnType<typeof seal>>) {
    const head = await getRegistryReleaseHead(access(owner, f));
    return requestRegistryReleaseApproval(command(owner, f, head.etag,
      { versionId: version.versionId, expectedContentHash: version.contentHash, intent: "PUBLISH" }));
  }
  beforeAll(async () => {
    db = createIntegrationPrisma(); service = client(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.SUPABASE_TEST_URL!);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.SUPABASE_TEST_ANON_KEY!);
    for (const flag of ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_INTERNAL_READ_ENABLED", "REGISTRY_INTERNAL_READ_HTTP_ENABLED",
      "REGISTRY_DRAFT_REVIEW_ENABLED", "REGISTRY_RELEASE_COMMANDS_ENABLED"]) vi.stubEnv(flag, "true");
    owner = await createActor(); reviewer = await createActor(); viewer = await createActor(); outsider = await createActor();
  }, 60000);
  afterAll(async () => {
    vi.unstubAllEnvs(); if (!db) return;
    try {
      // Only guarded disposable fixtures are removed; no production endpoint is accepted.
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
        for (const table of ["release_receipts", "release_withdrawals", "release_approvals", "release_requests", "command_receipts", "review_invalidations"]) {
          await tx.$executeRawUnsafe(`DELETE FROM registry_private.${table} WHERE project_id=ANY($1::uuid[])`, projects);
        }
        await tx.$executeRaw`DELETE FROM registry_private.operator_actions WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
        for (const table of [...tables].reverse()) await tx.$executeRawUnsafe(
          `DELETE FROM public.${table} WHERE ${table === "projects" ? "id" : "project_id"}=ANY($1::uuid[])`, projects);
        await tx.$executeRaw`DELETE FROM registry_private.internal_operators WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
      });
      for (const actor of actors) expect((await service.auth.admin.deleteUser(actor.id)).error).toBeNull();
    } finally { await db.$disconnect(); }
  }, 60000);

  it("computes draft hashes on the server while preserving the strict legacy DraftDTO", async () => {
    const f = await fixture(), draft = await getRegistryDraft(access(owner, f)), head = await getRegistryDraftHead(access(owner, f));
    expect(draftDTOSchema.parse(draft.result)).toEqual(draft.result);
    expect(draft.contentHash).toBe(hashSnapshot(f.payload));
    expect(head.result.contentHash).toBe(draft.contentHash);
    expect(head.etag).toBe(draft.etag);
    await db.projectDraft.update({ where: { id: f.draftId }, data: { manifest: {}, presentation: {} } });
    expect((await getRegistryDraftHead(access(owner, f))).result.contentHash).toBeNull();
    await denied(getRegistryDraft(access(owner, f)), "DRAFT_UNINITIALIZED");
  });

  it("keeps independent read gates default-deny and permits reads with every command gate closed", async () => {
    const f = await fixture();
    for (const flag of ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_INTERNAL_READ_ENABLED"]) {
      vi.stubEnv(flag, "");
      try { await denied(getRegistryProject(access(owner, f)), "DISABLED"); }
      finally { vi.stubEnv(flag, "true"); }
    }
    vi.stubEnv("REGISTRY_DRAFT_REVIEW_ENABLED", ""); vi.stubEnv("REGISTRY_RELEASE_COMMANDS_ENABLED", "");
    try {
      expect((await getRegistryDraft(access(owner, f))).contentHash).toBe(hashSnapshot(f.payload));
      expect((await getRegistryReadReleaseHead(access(owner, f))).result.currentReleaseId).toBeNull();
      expect((await listRegistryVersions(access(owner, f))).result.items).toEqual([]);
      const draft = await getRegistryDraft(access(owner, f));
      await denied(editRegistryDraft(command(owner, f, draft.etag, f.payload)), "DISABLED");
      await denied(requestRegistryReleaseApproval(command(owner, f, '"release:' + f.projectId + ':1"', {})), "DISABLED");
    } finally { vi.stubEnv("REGISTRY_DRAFT_REVIEW_ENABLED", "true"); vi.stubEnv("REGISTRY_RELEASE_COMMANDS_ENABLED", "true"); }
    await denied(getPublicRegistryRelease(f.projectId), "NOT_FOUND");
  });

  it("returns only this caller's active qualifications and intersects them with this project's roles", async () => {
    const actor = await createActor(["READ_DRAFT", "READ_RELEASE", "DECIDE_REVIEW", "EDIT_DRAFT"]), f = await fixture();
    await db.projectMembership.create({ data: { projectId: f.projectId, subjectId: actor.id, roles: ["VIEWER"] } });
    await db.$executeRaw`UPDATE registry_private.internal_operators SET expires_at=clock_timestamp()+interval '15 minutes' WHERE subject_id=${actor.id}::uuid`;
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()-interval '1 second' WHERE subject_id=${actor.id}::uuid AND action='DECIDE_REVIEW'`;
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${actor.id}::uuid AND action='EDIT_DRAFT'`;
    const before = Date.now(), eligibility = await getRegistryQualifications({ accessToken: actor.token });
    expect(eligibility.result.actions.map(item => item.action).sort()).toEqual(["READ_DRAFT", "READ_RELEASE"]);
    for (const item of eligibility.result.actions) expect(Date.parse(item.expiresAt)).toBeLessThan(before + 16 * 60 * 1000);
    const project = await getRegistryProject(access(actor, f));
    expect(project.result.roles).toEqual(["VIEWER"]);
    expect(project.result.effectiveActions.map(item => item.action).sort()).toEqual(["READ_DRAFT", "READ_RELEASE"]);
    const injected = { accessToken: actor.token, subjectId: owner.id };
    await denied(getRegistryQualifications(injected), "INVALID_INPUT");
    expect(JSON.stringify(eligibility)).not.toContain(owner.id);
  });

  it("projects review identity relative to the viewer and preserves sealed review provenance", async () => {
    const f = await fixture(), draft = await getRegistryDraft(access(owner, f));
    const submitted = await submitRegistryDraft(command(owner, f, draft.etag, { expectedContentHash: draft.contentHash }));
    expect(submitted.result.submittedByViewer).toBe(true);
    const owned = await getRegistryReview({ ...access(owner, f), reviewId: submitted.result.id });
    const other = await getRegistryReview({ ...access(reviewer, f), reviewId: submitted.result.id });
    expect(owned.result.submittedByViewer).toBe(true); expect(other.result.submittedByViewer).toBe(false);
    expect(reviewDTOSchema.parse(other.result)).toEqual(other.result);
    const reviews = await listRegistryReviews({ ...access(viewer, f), draftId: f.draftId });
    expect(reviews.result.items).toHaveLength(1); expect(reviews.result.items[0].submittedByViewer).toBe(false);
    const decided = await decideRegistryReview(command(reviewer, f, submitted.etag,
      { reviewId: submitted.result.id, decision: "APPROVED", expectedContentHash: draft.contentHash }));
    expect(decided.result.submittedByViewer).toBe(false);
    await sealRegistryVersion(command(owner, f, decided.etag, { reviewId: submitted.result.id, expectedContentHash: draft.contentHash }));
    expect((await getRegistryReview({ ...access(viewer, f), reviewId: submitted.result.id })).result.effectiveState).toBe("SEALED");
    expect(JSON.stringify([owned, other, reviews])).not.toMatch(/submitterId|reviewerId|assetDigestSet|policyRevision|authzEpoch/);
    expect(JSON.stringify([owned, other, reviews])).not.toContain(owner.id);
    expect(JSON.stringify([owned, other, reviews])).not.toContain(reviewer.id);
  });

  it("rehydrates viewer identity when replaying a valid review receipt written before C1-A", async () => {
    const f = await fixture(), draft = await getRegistryDraft(access(owner, f)), input = { expectedContentHash: draft.contentHash };
    const result = await submitRegistryDraft(command(owner, f, draft.etag, input));
    const oldResult = { ...result.result } as Record<string, unknown>; delete oldResult.submittedByViewer;
    const key = randomUUID(), project = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    const bodyHash = canonicalHash({ action: "SUBMIT_REVIEW", projectId: f.projectId, ifMatch: draft.etag, input });
    await db.$executeRaw`INSERT INTO registry_private.command_receipts(project_id,actor_id,idempotency_key,action,body_hash,expected_revision,authz_epoch,result)
      VALUES(${f.projectId}::uuid,${owner.id}::uuid,${key},'SUBMIT_REVIEW',${bodyHash},${draft.result.revision},${project.authzEpoch},
        ${JSON.stringify({ result: oldResult, etag: result.etag })}::jsonb)`;
    const replay = await submitRegistryDraft(command(owner, f, draft.etag, input, key));
    expect(replay.replayed).toBe(true); expect(replay.result.submittedByViewer).toBe(true);
    expect(reviewDTOSchema.parse(replay.result)).toEqual(replay.result);
  });

  it("reads release requests, independent approvals, consumed state and withdrawal history without party identities", async () => {
    const f = await fixture(), version = await seal(f), request = await releaseRequest(f, version);
    const pending = (await listRegistryReleaseRequests(access(owner, f))).result.items[0];
    expect(pending).toMatchObject({ id: request.result.id, state: "PENDING", approvalId: null, requestedByViewer: true, approvedByViewer: false, expired: false, stale: false });
    const approval = await approveRegistryRelease(command(reviewer, f, request.etag, { requestId: request.result.id }));
    const approved = (await listRegistryReleaseRequests(access(reviewer, f))).result.items[0];
    expect(approved).toMatchObject({ state: "APPROVED", approvalId: approval.result.id, requestedByViewer: false, approvedByViewer: true });
    const published = await publishRegistryRelease(command(owner, f, approval.etag, { approvalId: approval.result.id }));
    expect((await listRegistryReleaseRequests(access(viewer, f))).result.items[0].state).toBe("CONSUMED");
    expect((await getRegistryReadReleaseHead(access(viewer, f))).result.currentReleaseId).toBe(published.result.id);
    expect((await listRegistryReleaseHistory(access(viewer, f))).result.items[0]).toMatchObject({ id: published.result.id, state: "PUBLISHED", withdrawnAt: null });
    await withdrawRegistryRelease(command(owner, f, published.etag, { releaseId: published.result.id }));
    const history = await listRegistryReleaseHistory(access(viewer, f));
    expect(history.result.items[0]).toMatchObject({ id: published.result.id, state: "WITHDRAWN", intent: "PUBLISH" });
    expect(history.result.items[0].withdrawnAt).toEqual(expect.any(String));
    expect((await getRegistryReadReleaseHead(access(viewer, f))).result).toMatchObject({ currentReleaseId: null, visibility: "PRIVATE" });
    const serialized = JSON.stringify([pending, approved, history]);
    expect(serialized).not.toMatch(/requesterId|reviewerId|publishedBy|actorId|authorizationId|storageRef|assetDigestSet|audit/);
    for (const actor of [owner, reviewer, viewer]) expect(serialized).not.toContain(actor.id);
  });

  it("filters projects by active membership and binds every object ID to the authorized project", async () => {
    const f = await fixture(), foreign = await fixture(), v = await seal(foreign);
    const reader = await createActor();
    await db.projectMembership.create({ data: { projectId: f.projectId, subjectId: reader.id, roles: ["VIEWER"] } });
    expect((await listRegistryProjects({ accessToken: reader.token })).result.items.map(p => p.id)).toEqual([f.projectId]);
    expect((await listRegistryProjects({ accessToken: outsider.token })).result.items).toEqual([]);
    for (const read of [() => getRegistryProject(access(reader, foreign)), () => listRegistryVersions(access(reader, foreign)),
      () => listRegistryReleaseHistory(access(reader, foreign)), () => listRegistryReleaseRequests(access(reader, foreign)), () => getRegistryDraft(access(reader, foreign))]) {
      await denied(read(), "NOT_FOUND");
    }
    await denied(getRegistryVersion({ ...access(reader, f), versionId: v.versionId }), "NOT_FOUND");
    await denied(getRegistryReview({ ...access(reader, f), reviewId: v.reviewId }), "NOT_FOUND");
    await denied(listRegistryReviews({ ...access(reader, f), draftId: foreign.draftId }), "NOT_FOUND");
    const injected = { ...access(reader, f), ownerId: owner.id };
    await denied(getRegistryProject(injected), "INVALID_INPUT");
    const subject = { accessToken: outsider.token, subjectId: owner.id };
    await denied(listRegistryProjects(subject), "INVALID_INPUT");
    await denied(listRegistryProjects({ accessToken: reader.token, limit: 51 }), "INVALID_INPUT");
  });

  it("paginates a caller's project list without exposing foreign membership rows", async () => {
    const actor = await createActor(), first = await fixture(actor), second = await fixture(actor), foreign = await fixture();
    const page1 = await listRegistryProjects({ accessToken: actor.token, limit: 1 });
    expect(page1.result.items).toHaveLength(1); expect(page1.result.nextCursor).toBe(page1.result.items[0].id);
    const page2 = await listRegistryProjects({ accessToken: actor.token, limit: 1, after: page1.result.nextCursor! });
    expect(page2.result.items).toHaveLength(1); expect(page2.result.nextCursor).toBeNull();
    expect([page1.result.items[0].id, page2.result.items[0].id].sort()).toEqual([first.projectId, second.projectId].sort());
    expect(JSON.stringify([page1, page2])).not.toContain(foreign.projectId);
    expect(JSON.stringify([page1, page2])).not.toMatch(/subjectId|ownerId|memberships|authzEpoch|credential|accessToken/);
  });

  it("does not substitute ADMIN metadata or project OWNER for independent read qualifications", async () => {
    const unqualified = await createActor([], true), f = await fixture(unqualified);
    expect((await db.projectMembership.findUniqueOrThrow({ where: { projectId_subjectId: { projectId: f.projectId, subjectId: unqualified.id } } })).roles).toContain("OWNER");
    await denied(getRegistryProject(access(unqualified, f)), "FORBIDDEN");
    await denied(getRegistryDraft(access(unqualified, f)), "FORBIDDEN");
    await denied(getRegistryQualifications({ accessToken: unqualified.token }), "FORBIDDEN");
    const draftOnly = await createActor(["READ_DRAFT"]), own = await fixture(draftOnly);
    expect((await getRegistryProject(access(draftOnly, own))).result.roles).toEqual(["OWNER"]);
    expect((await getRegistryProject(access(draftOnly, own))).result.effectiveActions.map(a => a.action)).toEqual(["READ_DRAFT"]);
    expect((await getRegistryProject(access(draftOnly, own))).result).not.toHaveProperty("currentReleaseId");
    expect((await listRegistryProjects({ accessToken: draftOnly.token })).result.items[0]).not.toHaveProperty("currentReleaseId");
    await denied(getRegistryReadReleaseHead(access(draftOnly, own)), "FORBIDDEN");
    await denied(listRegistryReleaseHistory(access(draftOnly, own)), "FORBIDDEN");
    await denied(listRegistryReleaseRequests(access(draftOnly, own)), "FORBIDDEN");
    const releaseOnly = await createActor(["READ_RELEASE"]), releaseProject = await fixture(releaseOnly);
    expect((await getRegistryReadReleaseHead(access(releaseOnly, releaseProject))).result.projectId).toBe(releaseProject.projectId);
    await denied(getRegistryDraft(access(releaseOnly, releaseProject)), "FORBIDDEN");
    await denied(listRegistryVersions(access(releaseOnly, releaseProject)), "FORBIDDEN");
    await denied(listRegistryProjects({ accessToken: releaseOnly.token }), "FORBIDDEN");
  });

  it("rejects expired and deleted Auth sessions even while their signed JWT remains unexpired", async () => {
    const actor = await createActor(), f = await fixture(actor);
    expect((await getRegistryProject(access(actor, f))).result.id).toBe(f.projectId);
    await db.$executeRaw`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${actor.sessionId}::uuid`;
    await denied(getRegistryProject(access(actor, f)), "AUTH_REQUIRED");
    await denied(getRegistryDraft(access(actor, f)), "AUTH_REQUIRED");
    await db.$executeRaw`UPDATE auth.sessions SET not_after=NULL WHERE id=${actor.sessionId}::uuid`;
    await db.$executeRaw`DELETE FROM auth.sessions WHERE id=${actor.sessionId}::uuid`;
    await denied(getRegistryProject(access(actor, f)), "AUTH_REQUIRED");
    await denied(listRegistryProjects({ accessToken: actor.token }), "AUTH_REQUIRED");
    await denied(getRegistryReadReleaseHead(access(actor, f)), "AUTH_REQUIRED");
  });

  it("enforces action, operator and membership revocation or expiry on every subsequent read", async () => {
    const actor = await createActor(), f = await fixture();
    // OWNER membership must remain active. Revoke a separately qualified member
    // so the fixture respects the existing database ownership invariant.
    await db.projectMembership.create({ data: { projectId: f.projectId, subjectId: actor.id, roles: ["VIEWER"] } });
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${actor.id}::uuid AND action='READ_DRAFT'`;
    await denied(getRegistryProject(access(actor, f)), "FORBIDDEN");
    expect((await getRegistryReadReleaseHead(access(actor, f))).result.projectId).toBe(f.projectId);
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=true,expires_at=clock_timestamp()-interval '1 second' WHERE subject_id=${actor.id}::uuid AND action='READ_DRAFT'`;
    await denied(listRegistryProjects({ accessToken: actor.token }), "FORBIDDEN");
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '1 hour' WHERE subject_id=${actor.id}::uuid AND action='READ_DRAFT'`;
    await db.$executeRaw`UPDATE registry_private.internal_operators SET active=false WHERE subject_id=${actor.id}::uuid`;
    await denied(getRegistryProject(access(actor, f)), "FORBIDDEN");
    await denied(getRegistryReadReleaseHead(access(actor, f)), "FORBIDDEN");
    await db.$executeRaw`UPDATE registry_private.internal_operators SET active=true,expires_at=clock_timestamp()-interval '1 second' WHERE subject_id=${actor.id}::uuid`;
    await denied(getRegistryQualifications({ accessToken: actor.token }), "FORBIDDEN");
    await db.$executeRaw`UPDATE registry_private.internal_operators SET expires_at=clock_timestamp()+interval '1 hour' WHERE subject_id=${actor.id}::uuid`;
    await expect(db.projectMembership.update({ where: { projectId_subjectId: { projectId: f.projectId, subjectId: actor.id } }, data: { roles: [] } })).rejects.toThrow();
    expect((await getRegistryProject(access(actor, f))).result.roles).toEqual(["VIEWER"]);
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: f.projectId, subjectId: actor.id } }, data: { active: false } });
    await denied(getRegistryProject(access(actor, f)), "NOT_FOUND");
    await denied(listRegistryReleaseHistory(access(actor, f)), "NOT_FOUND");
    expect((await listRegistryProjects({ accessToken: actor.token })).result.items).toEqual([]);
  });

  it("checks database time again before returning a read whose session or qualification expired during its transaction", async () => {
    const actor = await createActor(), f = await fixture(actor);
    let completedWork = 0;
    const delayedRead = () => readTransaction(actor.token, "READ_DRAFT", async ctx => {
      const project = await authorizeProject(ctx, f.projectId);
      await ctx.tx.$queryRaw`SELECT true AS slept FROM pg_sleep(2.3)`;
      completedWork++;
      return project.id;
    });
    await db.$executeRaw`UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 seconds' WHERE id=${actor.sessionId}::uuid`;
    await denied(delayedRead(), "AUTH_REQUIRED");
    expect(completedWork).toBe(1);
    await db.$executeRaw`UPDATE auth.sessions SET not_after=NULL WHERE id=${actor.sessionId}::uuid`;
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '2 seconds'
      WHERE subject_id=${actor.id}::uuid AND action='READ_DRAFT'`;
    await denied(delayedRead(), "FORBIDDEN");
    expect(completedWork).toBe(2);
  }, 15000);

  it("maps real Auth and object authorization through the HTTP response whitelist", async () => {
    const f = await fixture(), handler = createRegistryReadHandler(), path = ["projects", f.projectId, "draft"];
    const request = (token: string, query = "") => new Request(`http://127.0.0.1/api/internal/registry/${path.join("/")}${query}`,
      { headers: { Authorization: `Bearer ${token}`, Origin: "http://127.0.0.1", "Sec-Fetch-Site": "same-origin" } });
    const ok = await handler(request(owner.token), path), body = await ok.json();
    expect(ok.status).toBe(200); expect(ok.headers.get("Cache-Control")).toContain("no-store");
    expect(ok.headers.get("ETag")).toBe(body.etag);
    expect(body.result.contentHash).toBe(hashSnapshot(f.payload)); expect(body.replayed).toBe(false);
    expect(Object.keys(body.result).sort()).toEqual(["id", "projectId", "revision", "state", "payload", "contentHash"].sort());
    const foreign = await handler(request(outsider.token), path);
    expect(foreign.status).toBe(404); expect(await foreign.json()).toEqual({ code: "NOT_FOUND" });
    const forged = await handler(request("invalid"), path);
    expect(forged.status).toBe(401); expect(await forged.json()).toEqual({ code: "AUTH_REQUIRED" });
    const injected = await handler(request(owner.token, `?ownerId=${owner.id}`), path);
    expect(injected.status).toBe(422); expect(await injected.json()).toEqual({ code: "INVALID_INPUT" });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/ownerId|updatedBy|submitterId|reviewerId|storageRef|registry_private|credential|accessToken|authzEpoch/);
    expect(serialized).not.toContain(owner.id);
    vi.stubEnv("REGISTRY_INTERNAL_READ_HTTP_ENABLED", "");
    try { expect((await handler(request(owner.token), path)).status).toBe(403); }
    finally { vi.stubEnv("REGISTRY_INTERNAL_READ_HTTP_ENABLED", "true"); }
  });
});
