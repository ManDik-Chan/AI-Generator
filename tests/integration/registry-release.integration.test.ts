import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";
import { hashSnapshot } from "@/features/registry/canonical";
import type { DraftPayload } from "@/features/registry/contracts";
import { RegistryProtocolError, decideRegistryReview, getRegistryDraft, sealRegistryVersion, submitRegistryDraft } from "@/features/registry/protocol";
import { approveRegistryRelease, getPublicRegistryRelease, getRegistryReleaseHead, publishRegistryRelease,
  requestRegistryReleaseApproval, rollbackRegistryRelease, withdrawRegistryRelease } from "@/features/registry/release";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real Release Auth/database environment required");
const actions = ["READ_DRAFT", "EDIT_DRAFT", "SUBMIT_REVIEW", "WITHDRAW_REVIEW", "DECIDE_REVIEW", "SEAL_VERSION",
  "READ_RELEASE", "REQUEST_RELEASE", "APPROVE_RELEASE", "PUBLISH_RELEASE", "WITHDRAW_RELEASE", "ROLLBACK_RELEASE"];
const registryTables = ["projects", "project_drafts", "project_versions", "project_releases", "project_assets", "project_documentation", "project_memberships", "publication_reviews"];
const privateTables = ["release_receipts", "release_withdrawals", "release_approvals", "release_requests"];
type Actor = { id: string; token: string; client: SupabaseClient; sessionId: string };
type Fixture = { projectId: string; draftId: string; payload: DraftPayload; versionId: string; contentHash: string; reviewId: string; assetId?: string };

describe.skipIf(!enabled)("Registry Release protocol with real Auth, PostgreSQL isolation and fresh authorization", () => {
  let db: PrismaClient, service: SupabaseClient;
  let owner: Actor, reviewer: Actor, publisher: Actor, viewer: Actor, outsider: Actor, unqualified: Actor;
  const actors: Actor[] = [], projects: string[] = [];
  const client = (key = process.env.SUPABASE_TEST_ANON_KEY!) => createClient(process.env.SUPABASE_TEST_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const access = (actor: Actor, f: Pick<Fixture, "projectId">) => ({ accessToken: actor.token, projectId: f.projectId });
  const command = (actor: Actor, f: Pick<Fixture, "projectId">, etag: string, input: unknown, idempotencyKey = randomUUID()) => ({
    ...access(actor, f), ifMatch: etag, idempotencyKey, input,
  });
  async function denied(promise: Promise<unknown>, codes: string | string[]) {
    try { await promise; throw new Error("Release security boundary unexpectedly accepted the operation"); }
    catch (error) {
      expect(error).toBeInstanceOf(RegistryProtocolError);
      expect(Array.isArray(codes) ? codes : [codes]).toContain((error as RegistryProtocolError).code);
    }
  }
  async function createActor(qualified = true) {
    const email = `registry-release-${randomUUID()}@example.test`, password = `Aa!${randomUUID()}z9`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(made.error).toBeNull();
    const signed = client(), login = await signed.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const token = login.data.session!.access_token;
    const sessionId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).session_id;
    const actor = { id: made.data.user!.id, token, client: signed, sessionId };
    actors.push(actor);
    if (qualified) {
      await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
        VALUES(${actor.id}::uuid,true,true,clock_timestamp()+interval '1 hour')`;
      for (const action of actions) await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
        VALUES(${actor.id}::uuid,${action},true,clock_timestamp()+interval '1 hour')`;
    }
    return actor;
  }
  async function fixture(visibility: "PRIVATE" | "PUBLIC" | "UNLISTED" = "PRIVATE", withAsset = false, shortReview = false): Promise<Fixture> {
    const project = await db.project.create({ data: { slug: `release-${randomUUID()}`, ownerId: owner.id } });
    projects.push(project.id);
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: project.id, subjectId: owner.id } }, data: { roles: ["OWNER", "REVIEWER"] } });
    await db.projectMembership.createMany({ data: [
      { projectId: project.id, subjectId: reviewer.id, roles: ["REVIEWER"] },
      { projectId: project.id, subjectId: publisher.id, roles: ["PUBLISHER", "REVIEWER"] },
      { projectId: project.id, subjectId: viewer.id, roles: ["VIEWER"] },
      { projectId: project.id, subjectId: unqualified.id, roles: ["PUBLISHER"] },
    ] });
    // ADMIN and user metadata are tested independently, never trusted as authority.
    const payload: DraftPayload = {
      manifest: { schemaVersion: "0.5.0", projectId: project.id, slug: project.slug, version: "1.0.0", name: "Release fixture",
        summary: "Synthetic isolated security fixture", category: "software", visibility, integration: { mode: "SHOWCASE" },
        capabilities: ["documentation.read"], researchClaims: [] },
      presentation: { schemaVersion: "0.5.0", projectId: project.id, version: "1.0.0", title: "Release fixture", sections: [] },
      documentation: [],
    };
    let assetId: string | undefined;
    if (withAsset) {
      const digest = createHash("sha256").update(randomUUID()).digest("hex");
      const asset = await db.projectAsset.create({ data: { projectId: project.id, sourceDigest: digest, mime: "text/markdown", dataClass: "CURATED",
        size: 32, storageRef: `private/nonexistent-release-${randomUUID()}`, provenance: { fixture: "isolated" }, rightsRef: "fixture-license" } });
      await db.projectAsset.update({ where: { id: asset.id }, data: { state: "VALIDATED", deliveryDigest: digest } });
      await db.projectAsset.update({ where: { id: asset.id }, data: { state: "APPROVED" } });
      assetId = asset.id;
      payload.documentation.push({ id: randomUUID(), title: "Synthetic README", language: "en", assetId });
    }
    const draft = await db.projectDraft.create({ data: { projectId: project.id, updatedBy: owner.id,
      manifest: payload.manifest, presentation: payload.presentation, documentation: payload.documentation } });
    const f = { projectId: project.id, draftId: draft.id, payload }, contentHash = hashSnapshot(payload);
    const current = await getRegistryDraft(access(owner, f));
    let submitted: { result: { id: string }; etag: string };
    if (shortReview) {
      const pending = await db.projectDraft.update({ where: { id: draft.id }, data: { state: "IN_REVIEW" } });
      const p = await db.project.findUniqueOrThrow({ where: { id: project.id } });
      const [clock] = await db.$queryRaw<{ expires: Date }[]>`SELECT clock_timestamp()+interval '2 seconds' AS expires`;
      const review = await db.publicationReview.create({ data: { projectId: project.id, draftId: draft.id, draftRevision: pending.revision,
        authzEpoch: p.authzEpoch, snapshotHash: contentHash, visibility, assetDigestSet: [], submitterId: owner.id, policyRevision: 1, expiresAt: clock.expires } });
      submitted = { result: { id: review.id }, etag: `"draft:${draft.id}:${pending.revision}"` };
    } else submitted = await submitRegistryDraft(command(owner, f, current.etag, { expectedContentHash: contentHash }));
    const decided = await decideRegistryReview(command(reviewer, f, submitted.etag,
      { reviewId: submitted.result.id, decision: "APPROVED", expectedContentHash: contentHash }));
    const sealed = await sealRegistryVersion(command(owner, f, decided.etag, { reviewId: submitted.result.id, expectedContentHash: contentHash }));
    return { ...f, versionId: sealed.result.id, contentHash, reviewId: submitted.result.id, assetId };
  }
  async function requested(f: Fixture, intent: "PUBLISH" | "ROLLBACK" = "PUBLISH", targetReleaseId?: string) {
    const head = await getRegistryReleaseHead(access(publisher, f));
    const input = { versionId: f.versionId, expectedContentHash: f.contentHash, intent, ...(targetReleaseId ? { targetReleaseId } : {}) };
    const request = command(publisher, f, head.etag, input);
    return { response: await requestRegistryReleaseApproval(request), request };
  }
  async function anotherVersion(f: Fixture, version: string): Promise<Fixture> {
    const payload: DraftPayload = { ...f.payload,
      manifest: { ...f.payload.manifest, version }, presentation: { ...f.payload.presentation, version }, documentation: [] };
    const draft = await db.projectDraft.create({ data: { projectId: f.projectId, updatedBy: owner.id,
      manifest: payload.manifest, presentation: payload.presentation, documentation: payload.documentation } });
    const contentHash = hashSnapshot(payload), current = await getRegistryDraft(access(owner, f));
    const submitted = await submitRegistryDraft(command(owner, f, current.etag, { expectedContentHash: contentHash }));
    const decided = await decideRegistryReview(command(reviewer, f, submitted.etag,
      { reviewId: submitted.result.id, decision: "APPROVED", expectedContentHash: contentHash }));
    const sealed = await sealRegistryVersion(command(owner, f, decided.etag, { reviewId: submitted.result.id, expectedContentHash: contentHash }));
    return { projectId: f.projectId, draftId: draft.id, payload, versionId: sealed.result.id, contentHash, reviewId: submitted.result.id };
  }
  async function approved(f: Fixture, intent: "PUBLISH" | "ROLLBACK" = "PUBLISH", targetReleaseId?: string) {
    const pending = await requested(f, intent, targetReleaseId);
    const request = command(reviewer, f, pending.response.etag, { requestId: pending.response.result.id });
    return { pending, response: await approveRegistryRelease(request), request };
  }
  async function published(f: Fixture) {
    const approval = await approved(f), request = command(publisher, f, approval.response.etag, { approvalId: approval.response.result.id });
    return { approval, response: await publishRegistryRelease(request), request };
  }
  async function cloneRequest(id: string, seconds: number, policyRevision = 1) {
    const [row] = await db.$queryRaw<{ id: string }[]>`INSERT INTO registry_private.release_requests
      (project_id,version_id,content_hash,visibility,asset_digest_set,authz_epoch,project_revision,current_release_id,policy_revision,intent,target_release_id,requester_id,expires_at)
      SELECT project_id,version_id,content_hash,visibility,asset_digest_set,authz_epoch,project_revision,current_release_id,${policyRevision},intent,target_release_id,requester_id,
        clock_timestamp()+make_interval(secs=>${seconds}) FROM registry_private.release_requests WHERE id=${id}::uuid RETURNING id`;
    return row.id;
  }
  async function delayedRelease(f: Fixture, work: () => Promise<void>) {
    const suffix = randomUUID().replaceAll("-", ""), fn = `test_release_delay_${suffix}`, trigger = `registry_test_delay_${suffix}`;
    expect(f.projectId).toMatch(/^[a-f0-9-]{36}$/);
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE FUNCTION registry_private.${fn}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
        BEGIN IF NEW.project_id='${f.projectId}'::uuid THEN PERFORM pg_catalog.pg_sleep(5.2); END IF; RETURN NEW; END $$`);
      await tx.$executeRawUnsafe(`REVOKE ALL ON FUNCTION registry_private.${fn}() FROM PUBLIC,anon,authenticated,service_role`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER ${trigger} AFTER INSERT ON public.project_releases FOR EACH ROW EXECUTE FUNCTION registry_private.${fn}()`);
    });
    try { await work(); } finally {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON public.project_releases`);
        await tx.$executeRawUnsafe(`DROP FUNCTION registry_private.${fn}()`);
      });
      const [left] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_proc WHERE pronamespace='registry_private'::regnamespace AND proname=${fn}`;
      expect(left.count).toBe(0);
    }
  }
  beforeAll(async () => {
    db = createIntegrationPrisma(); service = client(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
    owner = await createActor(); reviewer = await createActor(); publisher = await createActor(); viewer = await createActor();
    outsider = await createActor(); unqualified = await createActor(false);
    await db.profile.update({ where: { id: unqualified.id }, data: { role: "ADMIN" } });
    vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true"); vi.stubEnv("REGISTRY_DRAFT_REVIEW_ENABLED", "true");
    vi.stubEnv("REGISTRY_RELEASE_COMMANDS_ENABLED", "true");
  }, 60000);
  afterAll(async () => {
    vi.unstubAllEnvs(); if (!db) return;
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
        for (const table of privateTables) await tx.$executeRawUnsafe(`DELETE FROM registry_private.${table} WHERE project_id=ANY($1::uuid[])`, projects);
        await tx.$executeRaw`DELETE FROM registry_private.command_receipts WHERE project_id=ANY(${projects}::uuid[])`;
        await tx.$executeRaw`DELETE FROM registry_private.review_invalidations WHERE project_id=ANY(${projects}::uuid[])`;
        await tx.$executeRaw`DELETE FROM registry_private.operator_actions WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
        for (const table of [...registryTables].reverse()) await tx.$executeRawUnsafe(`DELETE FROM public.${table} WHERE ${table === "projects" ? "id" : "project_id"}=ANY($1::uuid[])`, projects);
        await tx.$executeRaw`DELETE FROM registry_private.internal_operators WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
      });
      for (const actor of actors) expect((await service.auth.admin.deleteUser(actor.id)).error).toBeNull();
    } finally { await db.$disconnect(); }
  }, 60000);

  it("defaults both independent Release gates closed and returns only an internal head", async () => {
    const f = await fixture();
    for (const flag of ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_RELEASE_COMMANDS_ENABLED"]) {
      vi.stubEnv(flag, ""); try { await denied(getRegistryReleaseHead(access(publisher, f)), "DISABLED"); } finally { vi.stubEnv(flag, "true"); }
    }
    const head = await getRegistryReleaseHead(access(publisher, f));
    expect(head.result).toEqual({ projectId: f.projectId, currentReleaseId: null, visibility: "PRIVATE" });
    expect(head.etag).toMatch(new RegExp(`^"release:${f.projectId}:[1-9][0-9]*"$`));
    expect(JSON.stringify(head)).not.toMatch(/snapshot|ownerId|storageRef|requester|reviewer|authorization/);
  });
  it("requires a strong current project revision precondition and strict command fields", async () => {
    const f = await fixture(), head = await getRegistryReleaseHead(access(publisher, f));
    const body = { versionId: f.versionId, expectedContentHash: f.contentHash, intent: "PUBLISH" };
    const request = command(publisher, f, head.etag, body);
    await denied(requestRegistryReleaseApproval({ ...request, ifMatch: undefined }), "PRECONDITION_REQUIRED");
    for (const ifMatch of [`W/${head.etag}`, `"release:${randomUUID()}:1"`, `"release:${f.projectId}:0"`])
      await denied(requestRegistryReleaseApproval({ ...request, ifMatch }), "INVALID_INPUT");
    await denied(requestRegistryReleaseApproval({ ...request, input: { ...body, ownerId: owner.id } }), "INVALID_INPUT");
    await denied(requestRegistryReleaseApproval({ ...request, input: { ...body, expectedContentHash: "0".repeat(64) } }), "HASH_MISMATCH");
    await denied(requestRegistryReleaseApproval({ ...request, input: { ...body, visibility: "PUBLIC" } }), "INVALID_INPUT");
  });
  it("verifies JWT signature and current session before authorizing Release reads", async () => {
    const f = await fixture(), [header, raw, signature] = publisher.token.split("."), claims = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    for (const token of ["invalid", `${header}.${Buffer.from(JSON.stringify({ ...claims, sub: owner.id })).toString("base64url")}.${signature}`,
      `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${raw}.`])
      await denied(getRegistryReleaseHead({ accessToken: token, projectId: f.projectId }), "AUTH_REQUIRED");
    await db.$executeRaw`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${publisher.sessionId}::uuid`;
    try { await denied(getRegistryReleaseHead(access(publisher, f)), "AUTH_REQUIRED"); }
    finally { await db.$executeRaw`UPDATE auth.sessions SET not_after=NULL WHERE id=${publisher.sessionId}::uuid`; }
  });
  it("separates project roles, per-action qualification and ADMIN/user_metadata", async () => {
    const f = await fixture(), head = await getRegistryReleaseHead(access(publisher, f));
    const body = { versionId: f.versionId, expectedContentHash: f.contentHash, intent: "PUBLISH" };
    await denied(requestRegistryReleaseApproval(command(viewer, f, head.etag, body)), ["FORBIDDEN", "NOT_FOUND"]);
    expect((await unqualified.client.auth.updateUser({ data: { internal: true, role: "PUBLISHER", actions } })).error).toBeNull();
    await denied(getRegistryReleaseHead(access(unqualified, f)), "FORBIDDEN");
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${publisher.id}::uuid AND action='REQUEST_RELEASE'`;
    try { await denied(requestRegistryReleaseApproval(command(publisher, f, head.etag, body)), "FORBIDDEN"); }
    finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET active=true WHERE subject_id=${publisher.id}::uuid AND action='REQUEST_RELEASE'`; }
  });
  it("hides cross-tenant head, Version, request, approval and Release identifiers", async () => {
    const f = await fixture(), other = await fixture(), pending = await requested(f), head = await getRegistryReleaseHead(access(publisher, other));
    await denied(getRegistryReleaseHead(access(outsider, f)), ["FORBIDDEN", "NOT_FOUND"]);
    await denied(requestRegistryReleaseApproval(command(publisher, other, head.etag, { versionId: f.versionId, expectedContentHash: f.contentHash, intent: "PUBLISH" })), "NOT_FOUND");
    await denied(approveRegistryRelease(command(reviewer, other, head.etag, { requestId: pending.response.result.id })), "NOT_FOUND");
    const approvedRelease = await approveRegistryRelease(command(reviewer, f, pending.response.etag, { requestId: pending.response.result.id }));
    await denied(publishRegistryRelease(command(publisher, other, head.etag, { approvalId: approvedRelease.result.id })), "NOT_FOUND");
    await denied(withdrawRegistryRelease(command(publisher, other, head.etag, { releaseId: randomUUID() })), "NOT_FOUND");
  });
  it("requires independent fresh approval even for a sealed Version", async () => {
    const f = await fixture(), pending = await requested(f);
    await denied(publishRegistryRelease(command(publisher, f, pending.response.etag, { approvalId: f.reviewId })), "NOT_FOUND");
    await denied(approveRegistryRelease(command(publisher, f, pending.response.etag, { requestId: pending.response.result.id })), "FORBIDDEN");
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
    const approval = await approveRegistryRelease(command(reviewer, f, pending.response.etag, { requestId: pending.response.result.id }));
    await denied(publishRegistryRelease(command(owner, f, approval.etag, { approvalId: approval.result.id })), "APPROVAL_INVALID");
  });
  it("publishes a Version with expired original Review using new release-level authorization", async () => {
    const f = await fixture("PRIVATE", false, true), oldVersion = await db.projectVersion.findUniqueOrThrow({ where: { id: f.versionId } });
    await db.$queryRaw`SELECT 1 AS waited FROM (SELECT pg_sleep(greatest(0,extract(epoch FROM (expires_at-clock_timestamp())))+0.025)
      FROM public.publication_reviews WHERE id=${f.reviewId}::uuid) AS delay`;
    const result = await published(f);
    expect(result.response.result.state).toBe("PUBLISHED");
    expect(await db.projectVersion.findUniqueOrThrow({ where: { id: f.versionId } })).toEqual(oldVersion);
    expect((await db.publicationReview.findUniqueOrThrow({ where: { id: f.reviewId } })).decision).toBe("APPROVED");
  }, 15000);
  it("atomically publishes once and recovers a lost response through an immutable receipt", async () => {
    const f = await fixture(), approval = await approved(f), before = await db.projectVersion.findUniqueOrThrow({ where: { id: f.versionId } });
    const request = command(publisher, f, approval.response.etag, { approvalId: approval.response.result.id });
    const results = await Promise.all([publishRegistryRelease(request), publishRegistryRelease(request)]);
    expect(results.map(r => r.replayed).sort()).toEqual([false, true]); expect(results[0].result).toEqual(results[1].result);
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(1);
    const head = await getRegistryReleaseHead(access(publisher, f)); expect(head.result.currentReleaseId).toBe(results[0].result.id);
    expect(await db.projectVersion.findUniqueOrThrow({ where: { id: f.versionId } })).toEqual(before);
    await denied(publishRegistryRelease({ ...request, input: { approvalId: randomUUID() } }), "IDEMPOTENCY_CONFLICT");
    await denied(rollbackRegistryRelease(request), "IDEMPOTENCY_CONFLICT");
  });
  it("serializes competing approvals and publication commands with different idempotency keys", async () => {
    const f = await fixture(), pending = await requested(f);
    const decisions = await Promise.allSettled([1, 2].map(() => approveRegistryRelease(command(reviewer, f, pending.response.etag, { requestId: pending.response.result.id }))));
    expect(decisions.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter(r => r.status === "rejected")).toHaveLength(1);
    const approval = (decisions.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof approveRegistryRelease>>>).value;
    const publications = await Promise.allSettled([1, 2].map(() => publishRegistryRelease(command(publisher, f, approval.etag, { approvalId: approval.result.id }))));
    expect(publications.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(publications.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(1);
  });
  it("recovers request and approval responses without creating duplicate authorization facts", async () => {
    const f = await fixture(), pending = await requested(f), replay = await requestRegistryReleaseApproval(pending.request);
    expect(replay.replayed).toBe(true); expect(replay.result.id).toBe(pending.response.result.id);
    const request = command(reviewer, f, pending.response.etag, { requestId: pending.response.result.id });
    const approval = await approveRegistryRelease(request), replayed = await approveRegistryRelease(request);
    expect(replayed.replayed).toBe(true); expect(replayed.result).toEqual(approval.result);
    const [facts] = await db.$queryRaw<{ requests: number; approvals: number }[]>`SELECT
      (SELECT count(*)::int FROM registry_private.release_requests WHERE project_id=${f.projectId}::uuid) AS requests,
      (SELECT count(*)::int FROM registry_private.release_approvals WHERE project_id=${f.projectId}::uuid) AS approvals`;
    expect(facts).toEqual({ requests: 1, approvals: 1 });
  });
  it("serializes distinct Version publication competition and preserves both candidate Versions", async () => {
    const first = await fixture(), second = await anotherVersion(first, "2.0.0");
    const before = await db.projectVersion.findMany({ where: { projectId: first.projectId }, orderBy: { version: "asc" } });
    const a = await approved(first), b = await approved(second);
    expect(a.response.etag).toBe(b.response.etag);
    const requests = [command(publisher, first, a.response.etag, { approvalId: a.response.result.id }),
      command(publisher, second, b.response.etag, { approvalId: b.response.result.id })];
    const results = await Promise.allSettled(requests.map(publishRegistryRelease));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(RegistryProtocolError); expect(["PRECONDITION_FAILED", "APPROVAL_INVALID", "CONFLICT"]).toContain(failed.reason.code);
    expect(await db.projectRelease.count({ where: { projectId: first.projectId } })).toBe(1);
    expect(await db.projectVersion.findMany({ where: { projectId: first.projectId }, orderBy: { version: "asc" } })).toEqual(before);
  });
  it("scopes the same idempotency key independently to actor and project", async () => {
    const f = await fixture(), other = await fixture(), key = randomUUID();
    const head = await getRegistryReleaseHead(access(publisher, f)), otherHead = await getRegistryReleaseHead(access(publisher, other));
    const body = { versionId: f.versionId, expectedContentHash: f.contentHash, intent: "PUBLISH" };
    const a = await requestRegistryReleaseApproval(command(publisher, f, head.etag, body, key));
    const b = await requestRegistryReleaseApproval(command(owner, f, head.etag, body, key));
    const c = await requestRegistryReleaseApproval(command(publisher, other, otherHead.etag,
      { versionId: other.versionId, expectedContentHash: other.contentHash, intent: "PUBLISH" }, key));
    expect(new Set([a.result.id, b.result.id, c.result.id]).size).toBe(3);
  });
  it("rejects receipt replay after session expiry despite an unchanged JWT", async () => {
    const f = await fixture(), publication = await published(f);
    await db.$executeRaw`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${publisher.sessionId}::uuid`;
    try { await denied(publishRegistryRelease(publication.request), "AUTH_REQUIRED"); }
    finally { await db.$executeRaw`UPDATE auth.sessions SET not_after=NULL WHERE id=${publisher.sessionId}::uuid`; }
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(1);
  });
  it("rejects replay after action revocation and does not revive old receipts after regrant", async () => {
    const f = await fixture(), publication = await published(f);
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${publisher.id}::uuid AND action='PUBLISH_RELEASE'`;
    try { await denied(publishRegistryRelease(publication.request), "FORBIDDEN"); }
    finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET active=true WHERE subject_id=${publisher.id}::uuid AND action='PUBLISH_RELEASE'`; }
    await denied(publishRegistryRelease(publication.request), "REPLAY_STALE");
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(1);
  });
  it("rejects stale authorization after reviewer membership revocation and regrant", async () => {
    const f = await fixture(), approval = await approved(f);
    for (const active of [false, true]) await db.projectMembership.update({ where: { projectId_subjectId: { projectId: f.projectId, subjectId: reviewer.id } }, data: { active } });
    const head = await getRegistryReleaseHead(access(publisher, f));
    await denied(publishRegistryRelease(command(publisher, f, head.etag, { approvalId: approval.response.result.id })), "APPROVAL_INVALID");
    await denied(approveRegistryRelease(approval.request), "REPLAY_STALE");
  });
  it("detects natural reviewer action expiry without an UPDATE or authz epoch event", async () => {
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '3 seconds' WHERE subject_id=${reviewer.id}::uuid AND action='APPROVE_RELEASE'`;
    try {
      const f = await fixture(), approval = await approved(f), before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
      await db.$queryRaw`SELECT 1 AS waited FROM (SELECT pg_sleep(greatest(0,extract(epoch FROM (expires_at-clock_timestamp())))+0.025)
        FROM registry_private.operator_actions WHERE subject_id=${reviewer.id}::uuid AND action='APPROVE_RELEASE') AS delay`;
      expect((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).authzEpoch).toBe(before.authzEpoch);
      await denied(publishRegistryRelease(command(publisher, f, approval.response.etag, { approvalId: approval.response.result.id })), ["FORBIDDEN", "APPROVAL_INVALID"]);
      expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
    } finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '1 hour' WHERE subject_id=${reviewer.id}::uuid AND action='APPROVE_RELEASE'`; }
  }, 15000);
  it("rejects naturally expired release requests and their cached successful responses", async () => {
    const f = await fixture(), pending = await requested(f), requestId = await cloneRequest(pending.response.result.id, 1);
    const request = command(reviewer, f, pending.response.etag, { requestId });
    const approval = await approveRegistryRelease(request);
    await new Promise(resolve => setTimeout(resolve, 1100));
    await denied(publishRegistryRelease(command(publisher, f, approval.etag, { approvalId: approval.result.id })), "APPROVAL_INVALID");
    await denied(approveRegistryRelease(request), "REPLAY_STALE");
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
  });
  it("rejects authorization from another policy revision", async () => {
    const f = await fixture(), pending = await requested(f);
    await expect(cloneRequest(pending.response.result.id, 60, 2)).rejects.toThrow("Current release request authority");
  });
  it("withdraws by append-only fact, preserves all immutable rows and invalidates publication replay", async () => {
    const f = await fixture("PUBLIC"), publication = await published(f), before = await db.projectRelease.findUniqueOrThrow({ where: { id: publication.response.result.id } });
    const version = await db.projectVersion.findUniqueOrThrow({ where: { id: f.versionId } });
    const request = command(publisher, f, publication.response.etag, { releaseId: before.id });
    const result = await withdrawRegistryRelease(request), replay = await withdrawRegistryRelease(request);
    expect(result.result.state).toBe("WITHDRAWN"); expect(replay.replayed).toBe(true); expect(replay.result).toEqual(result.result);
    expect(await db.projectRelease.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    expect(await db.projectVersion.findUniqueOrThrow({ where: { id: f.versionId } })).toEqual(version);
    expect((await getRegistryReleaseHead(access(publisher, f))).result).toEqual({ projectId: f.projectId, currentReleaseId: null, visibility: "PRIVATE" });
    await denied(publishRegistryRelease(publication.request), "REPLAY_STALE");
    await expect(db.projectRelease.update({ where: { id: before.id }, data: { state: "WITHDRAWN", withdrawnAt: new Date() } })).rejects.toThrow();
    await expect(db.projectRelease.delete({ where: { id: before.id } })).rejects.toThrow();
  });
  it("prevents the null-current-release ABA cycle from reviving an old precondition or approval", async () => {
    const f = await fixture(), pending = await requested(f), initial = pending.response.etag, publication = await published(f);
    await withdrawRegistryRelease(command(publisher, f, publication.response.etag, { releaseId: publication.response.result.id }));
    const head = await getRegistryReleaseHead(access(publisher, f)); expect(head.result.currentReleaseId).toBeNull(); expect(head.etag).not.toBe(initial);
    await denied(requestRegistryReleaseApproval({ ...pending.request, idempotencyKey: randomUUID() }), "PRECONDITION_FAILED");
    await denied(approveRegistryRelease(command(reviewer, f, head.etag, { requestId: pending.response.result.id })), "APPROVAL_INVALID");
  });
  it("requires a new approval for withdrawn-version republication and rollback, producing new Release history", async () => {
    const f = await fixture(), first = await published(f);
    await withdrawRegistryRelease(command(publisher, f, first.response.etag, { releaseId: first.response.result.id }));
    const head = await getRegistryReleaseHead(access(publisher, f));
    await denied(rollbackRegistryRelease(command(publisher, f, head.etag, { approvalId: first.approval.response.result.id })), "APPROVAL_INVALID");
    const approval = await approved(f, "ROLLBACK", first.response.result.id);
    await denied(publishRegistryRelease(command(publisher, f, approval.response.etag, { approvalId: approval.response.result.id })), "APPROVAL_INVALID");
    const request = command(publisher, f, approval.response.etag, { approvalId: approval.response.result.id });
    const rolled = await rollbackRegistryRelease(request), replay = await rollbackRegistryRelease(request);
    expect(rolled.result.id).not.toBe(first.response.result.id); expect(rolled.result.versionId).toBe(f.versionId); expect(replay.replayed).toBe(true);
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(2);
    const next = await published(f); expect(next.response.result.id).not.toBe(rolled.result.id);
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(3);
  });
  it("rejects invented rollback targets and concurrent publication versus withdrawal", async () => {
    const f = await fixture(), first = await published(f), head = await getRegistryReleaseHead(access(publisher, f));
    await denied(requestRegistryReleaseApproval(command(publisher, f, head.etag,
      { versionId: f.versionId, expectedContentHash: f.contentHash, intent: "ROLLBACK", targetReleaseId: randomUUID() })), "NOT_FOUND");
    const approval = await approved(f);
    const results = await Promise.allSettled([
      publishRegistryRelease(command(publisher, f, approval.response.etag, { approvalId: approval.response.result.id })),
      withdrawRegistryRelease(command(publisher, f, approval.response.etag, { releaseId: first.response.result.id })),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  });
  it("rolls back v2 to historical v1 only through a new approval and new immutable Release", async () => {
    const first = await fixture(), second = await anotherVersion(first, "2.0.0"), v1 = await published(first), v2 = await published(second);
    const before = await db.projectVersion.findMany({ where: { projectId: first.projectId }, orderBy: { version: "asc" } });
    expect((await getRegistryReleaseHead(access(publisher, first))).result.currentReleaseId).toBe(v2.response.result.id);
    await denied(publishRegistryRelease(v1.request), "REPLAY_STALE");
    const approval = await approved(first, "ROLLBACK", v1.response.result.id);
    const rolled = await rollbackRegistryRelease(command(publisher, first, approval.response.etag, { approvalId: approval.response.result.id }));
    expect(rolled.result.versionId).toBe(first.versionId); expect(rolled.result.id).not.toBe(v1.response.result.id);
    expect((await getRegistryReleaseHead(access(publisher, first))).result.currentReleaseId).toBe(rolled.result.id);
    expect(await db.projectRelease.count({ where: { projectId: first.projectId } })).toBe(3);
    expect(await db.projectVersion.findMany({ where: { projectId: first.projectId }, orderBy: { version: "asc" } })).toEqual(before);
    await denied(publishRegistryRelease(v2.request), "REPLAY_STALE");
  });
  it("rejects an actual foreign Release withdrawal and an explicitly invalidated original Review", async () => {
    const f = await fixture(), other = await fixture(), released = await published(f), approval = await approved(other);
    const head = await getRegistryReleaseHead(access(publisher, other));
    await denied(withdrawRegistryRelease(command(publisher, other, head.etag, { releaseId: released.response.result.id })), "NOT_FOUND");
    await db.$executeRaw`INSERT INTO registry_private.review_invalidations(review_id,project_id,actor_id,reason)
      VALUES(${other.reviewId}::uuid,${other.projectId}::uuid,${owner.id}::uuid,'WITHDRAWN')`;
    await denied(publishRegistryRelease(command(publisher, other, head.etag, { approvalId: approval.response.result.id })), "APPROVAL_INVALID");
    expect(await db.projectRelease.count({ where: { projectId: other.projectId } })).toBe(0);
  });
  it("guards raw database inserts against missing authorization, wrong publisher and orphan publication", async () => {
    const f = await fixture(), approval = await approved(f);
    await expect(db.projectRelease.create({ data: { projectId: f.projectId, versionId: f.versionId, contentHash: f.contentHash,
      visibilityAtApproval: "PRIVATE", publishedAt: new Date() } })).rejects.toThrow();
    const insert = (publishedBy: string) => db.$executeRaw`INSERT INTO public.project_releases
      (id,project_id,version_id,visibility_at_approval,content_hash,published_at,authorization_id,published_by)
      VALUES(gen_random_uuid(),${f.projectId}::uuid,${f.versionId}::uuid,'PRIVATE',${f.contentHash},clock_timestamp(),${approval.response.result.id}::uuid,${publishedBy}::uuid)`;
    await expect(insert(owner.id)).rejects.toThrow("Fresh exact release approval");
    // Even the exact approved insert cannot commit without its atomic pointer.
    await expect(insert(publisher.id)).rejects.toThrow("Publication and current pointer must commit atomically");
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
    const helpers = await db.$queryRaw<{ name: string; definer: boolean; anon: boolean; authenticated: boolean; service: boolean }[]>`
      SELECT proname AS name,prosecdef AS definer,has_function_privilege('anon',oid,'EXECUTE') AS anon,
        has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',oid,'EXECUTE') AS service
      FROM pg_proc WHERE pronamespace='registry_private'::regnamespace AND (proname LIKE '%release%' OR proname='finalize_publication')`;
    expect(helpers.length).toBeGreaterThanOrEqual(5); expect(helpers.every(h => !h.definer && !h.anon && !h.authenticated && !h.service)).toBe(true);
  });
  it("does not allow caller-supplied future creation time to extend the release approval TTL", async () => {
    const f = await fixture(), pending = await requested(f);
    await expect(db.$executeRaw`INSERT INTO registry_private.release_requests
      (project_id,version_id,content_hash,visibility,asset_digest_set,authz_epoch,project_revision,current_release_id,policy_revision,intent,target_release_id,requester_id,created_at,expires_at)
      SELECT project_id,version_id,content_hash,visibility,asset_digest_set,authz_epoch,project_revision,current_release_id,policy_revision,intent,target_release_id,requester_id,
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '70 minutes'
      FROM registry_private.release_requests WHERE id=${pending.response.result.id}::uuid`).rejects.toThrow();
    const [facts] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.release_requests WHERE project_id=${f.projectId}::uuid`;
    expect(facts.count).toBe(1);
  });
  it("allows revocation on mismatched legacy visibility without exposing or reselecting old authorization", async () => {
    const f = await fixture(), publication = await published(f);
    // B1 permitted PRIVATE project metadata with a PUBLIC current Release.
    // Recreate only that historical inconsistency in this synthetic fixture.
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
      await tx.projectRelease.update({ where: { id: publication.response.result.id }, data: { visibilityAtApproval: "PUBLIC" } });
    });
    const before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: f.projectId, subjectId: reviewer.id } }, data: { active: false } });
    const after = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    expect(after.authzEpoch).toBeGreaterThan(before.authzEpoch); expect(after.visibility).toBe("PRIVATE");
    await denied(getPublicRegistryRelease({ projectId: f.projectId }), "NOT_FOUND");
    await denied(publishRegistryRelease(publication.request), "REPLAY_STALE");
    const head = await getRegistryReleaseHead(access(publisher, f));
    await withdrawRegistryRelease(command(publisher, f, head.etag, { releaseId: publication.response.result.id }));
    await expect(db.project.update({ where: { id: f.projectId }, data: { currentReleaseId: publication.response.result.id } })).rejects.toThrow();
  });
  it("invalidates approval when authorized asset metadata is retired", async () => {
    const f = await fixture("PRIVATE", true), approval = await approved(f);
    await db.projectAsset.update({ where: { id: f.assetId! }, data: { state: "RETIRED" } });
    const head = await getRegistryReleaseHead(access(publisher, f));
    await denied(publishRegistryRelease(command(publisher, f, head.etag, { approvalId: approval.response.result.id })), ["APPROVAL_INVALID", "ASSET_INVALID"]);
    await denied(requestRegistryReleaseApproval(command(publisher, f, head.etag,
      { versionId: f.versionId, expectedContentHash: f.contentHash, intent: "PUBLISH" })), "ASSET_INVALID");
  });
  it.each(["PUBLIC", "UNLISTED", "PRIVATE"] as const)("keeps %s projection denied despite approved metadata without verified object bytes and ACL", async visibility => {
    const f = await fixture(visibility, true), publication = await published(f);
    for (const input of [{ projectId: f.projectId }, { releaseId: publication.response.result.id }, { projectId: f.projectId, accessToken: publisher.token }])
      await denied(getPublicRegistryRelease(input), "NOT_FOUND");
    expect(JSON.stringify(publication.response)).not.toMatch(/snapshot|storageRef|rights|provenance|requester|reviewer|authorization/);
    const anon = client();
    expect((await anon.from("project_releases").select("*").eq("id", publication.response.result.id)).error).not.toBeNull();
    expect((await anon.from("project_assets").select("*").eq("id", f.assetId!)).error).not.toBeNull();
    await withdrawRegistryRelease(command(publisher, f, publication.response.etag, { releaseId: publication.response.result.id }));
    await denied(getPublicRegistryRelease({ releaseId: publication.response.result.id }), "NOT_FOUND");
  });
  it("rolls back Release, current pointer and receipt if approval expires during the final insert", async () => {
    const f = await fixture(), pending = await requested(f), requestId = await cloneRequest(pending.response.result.id, 5);
    const approval = await approveRegistryRelease(command(reviewer, f, pending.response.etag, { requestId }));
    const before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } }), key = randomUUID();
    await delayedRelease(f, async () => {
      const start = performance.now();
      await denied(publishRegistryRelease(command(publisher, f, approval.etag, { approvalId: approval.result.id }, key)), ["APPROVAL_INVALID", "CONFLICT"]);
      expect(performance.now() - start).toBeGreaterThanOrEqual(5000);
    });
    expect(await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).toEqual(before);
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
    const [receipt] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.release_receipts WHERE project_id=${f.projectId}::uuid AND idempotency_key=${key}`;
    expect(receipt.count).toBe(0);
  }, 25000);
  it("rolls back final publication if reviewer qualification expires after the initial authorization check", async () => {
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '5 seconds' WHERE subject_id=${reviewer.id}::uuid AND action='APPROVE_RELEASE'`;
    try {
      const f = await fixture(), approval = await approved(f), before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } }), key = randomUUID();
      await delayedRelease(f, async () => {
        const start = performance.now();
        await denied(publishRegistryRelease(command(publisher, f, approval.response.etag, { approvalId: approval.response.result.id }, key)), ["FORBIDDEN", "APPROVAL_INVALID", "CONFLICT"]);
        expect(performance.now() - start).toBeGreaterThanOrEqual(5000);
      });
      expect(await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).toEqual(before);
      expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
      const [receipt] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.release_receipts WHERE project_id=${f.projectId}::uuid AND idempotency_key=${key}`;
      expect(receipt.count).toBe(0);
    } finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '1 hour' WHERE subject_id=${reviewer.id}::uuid AND action='APPROVE_RELEASE'`; }
  }, 25000);
  it("keeps all Release authorization, withdrawal and receipt records private and append-only", async () => {
    const rows = await db.$queryRaw<{ relname: string; rls: boolean; anon: boolean; authenticated: boolean; service: boolean }[]>`
      SELECT relname,relrowsecurity AS rls,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,
        has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated,
        has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') AS service FROM pg_class
      WHERE relnamespace='registry_private'::regnamespace AND relname=ANY(${privateTables}::text[])`;
    expect(rows).toHaveLength(4); expect(rows.every(r => r.rls && !r.anon && !r.authenticated && !r.service)).toBe(true);
    for (const actor of [client(), publisher.client, service]) for (const table of privateTables)
      expect((await actor.schema("registry_private").from(table).select("*")).error).not.toBeNull();
    for (const table of privateTables) for (const operation of ["DELETE", "UPDATE"]) {
      const assignment = table === "release_receipts" ? "result=result" : table === "release_withdrawals" ? "actor_id=actor_id" : "id=id";
      await expect(db.$executeRawUnsafe(operation === "DELETE" ? `DELETE FROM registry_private.${table}` : `UPDATE registry_private.${table} SET ${assignment}`)).rejects.toThrow();
    }
  });
});
