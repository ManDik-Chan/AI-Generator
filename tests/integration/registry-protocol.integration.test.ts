import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

import { hashSnapshot } from "@/features/registry/canonical";
import { draftDTOSchema, versionDTOSchema, type DraftPayload } from "@/features/registry/contracts";
import {
  RegistryProtocolError, decideRegistryReview, editRegistryDraft, getRegistryDraft,
  getRegistryDraftHead, getRegistryReview, sealRegistryVersion, submitRegistryDraft, withdrawRegistryReview,
} from "@/features/registry/protocol";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real Registry protocol Auth/database environment required");
const actions = ["READ_DRAFT", "EDIT_DRAFT", "SUBMIT_REVIEW", "WITHDRAW_REVIEW", "DECIDE_REVIEW", "SEAL_VERSION"];
const registryTables = ["projects", "project_drafts", "project_versions", "project_releases", "project_assets", "project_documentation", "project_memberships", "publication_reviews"];
type Actor = { id: string; token: string; client: SupabaseClient; sessionId: string };
type Fixture = { projectId: string; draftId: string; slug: string; payload: DraftPayload };

describe.skipIf(!enabled)("Registry draft/review protocol with real Auth sessions and PostgreSQL transactions", () => {
  let db: PrismaClient, service: SupabaseClient;
  let owner: Actor, editor: Actor, reviewer: Actor, viewer: Actor, publisher: Actor, outsider: Actor, unqualified: Actor;
  const actors: Actor[] = [], projects: string[] = [];
  const client = (key = process.env.SUPABASE_TEST_ANON_KEY!) => createClient(process.env.SUPABASE_TEST_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const access = (actor: Actor, f: Fixture) => ({ accessToken: actor.token, projectId: f.projectId });
  const command = (actor: Actor, f: Fixture, etag: string, input: unknown, idempotencyKey = randomUUID()) => ({
    ...access(actor, f), ifMatch: etag, idempotencyKey, input,
  });
  async function denied(promise: Promise<unknown>, codes: string | string[]) {
    try { await promise; throw new Error("Security boundary unexpectedly accepted the operation"); }
    catch (error) {
      expect(error).toBeInstanceOf(RegistryProtocolError);
      expect(Array.isArray(codes) ? codes : [codes]).toContain((error as RegistryProtocolError).code);
    }
  }
  async function createActor(qualified = true) {
    const email = `registry-protocol-${randomUUID()}@example.test`, password = `Aa!${randomUUID()}z9`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(made.error).toBeNull();
    const signed = client(), login = await signed.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const token = login.data.session!.access_token;
    const sessionId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).session_id;
    expect(sessionId).toEqual(expect.any(String));
    const actor = { id: made.data.user!.id, token, client: signed, sessionId };
    actors.push(actor);
    if (qualified) {
      await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
        VALUES(${actor.id}::uuid,true,true,now()+interval '1 hour')`;
      for (const action of actions) await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
        VALUES(${actor.id}::uuid,${action},true,now()+interval '1 hour')`;
    }
    return actor;
  }
  async function fixture() {
    const project = await db.project.create({ data: { slug: `proto-${randomUUID()}`, ownerId: owner.id } });
    projects.push(project.id);
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: project.id, subjectId: owner.id } }, data: { roles: ["OWNER", "REVIEWER"] } });
    await db.projectMembership.createMany({ data: [
      { projectId: project.id, subjectId: editor.id, roles: ["EDITOR"] },
      { projectId: project.id, subjectId: reviewer.id, roles: ["REVIEWER"] },
      { projectId: project.id, subjectId: viewer.id, roles: ["VIEWER"] },
      { projectId: project.id, subjectId: publisher.id, roles: ["PUBLISHER"] },
      { projectId: project.id, subjectId: unqualified.id, roles: ["EDITOR"] },
    ] });
    const payload: DraftPayload = {
      manifest: { schemaVersion: "0.5.0", projectId: project.id, slug: project.slug, version: "1.0.0", name: "Protocol fixture",
        summary: "Synthetic isolated security fixture", category: "software", visibility: "PRIVATE", integration: { mode: "SHOWCASE" },
        capabilities: ["documentation.read"], researchClaims: [] },
      presentation: { schemaVersion: "0.5.0", projectId: project.id, version: "1.0.0", title: "Protocol fixture", sections: [] },
      documentation: [],
    };
    const draft = await db.projectDraft.create({ data: { projectId: project.id, updatedBy: owner.id,
      manifest: payload.manifest, presentation: payload.presentation, documentation: payload.documentation } });
    return { projectId: project.id, draftId: draft.id, slug: project.slug, payload };
  }
  function changed(f: Fixture, title: string): DraftPayload {
    return { ...f.payload, presentation: { ...f.payload.presentation, title } };
  }
  async function approved(f: Fixture) {
    const current = await getRegistryDraft(access(owner, f)), contentHash = hashSnapshot(current.result.payload);
    const submitted = await submitRegistryDraft(command(owner, f, current.etag, { expectedContentHash: contentHash }));
    const decisionRequest = command(reviewer, f, submitted.etag,
      { reviewId: submitted.result.id, decision: "APPROVED", expectedContentHash: contentHash });
    const decision = await decideRegistryReview(decisionRequest);
    return { reviewId: submitted.result.id, contentHash, etag: decision.etag, submitted, decision, decisionRequest };
  }
  async function asset(f: Fixture, mime = "text/markdown", dataClass = "CURATED") {
    const digest = createHash("sha256").update(`isolated-${randomUUID()}`).digest("hex");
    const row = await db.projectAsset.create({ data: { projectId: f.projectId, sourceDigest: digest, mime, dataClass,
      size: 32, storageRef: `private/protocol-${randomUUID()}`, provenance: { fixture: "isolated" }, rightsRef: "fixture-license" } });
    await db.projectAsset.update({ where: { id: row.id }, data: { state: "VALIDATED", deliveryDigest: digest } });
    await db.projectAsset.update({ where: { id: row.id }, data: { state: "APPROVED" } });
    return { ...row, deliveryDigest: digest };
  }
  async function delayOnlyThisDraftFreeze(f: Fixture, work: () => Promise<void>) {
    // This helper is executed only by this guarded disposable integration suite.
    // Names and the sole target UUID are generated here, never caller input.
    expect(f.projectId).toMatch(/^[a-f0-9-]{36}$/);
    const suffix = randomUUID().replaceAll("-", "");
    const fn = `test_protocol_delay_${suffix}`, trigger = `registry_test_delay_${suffix}`;
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE FUNCTION registry_private.${fn}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
        BEGIN
          IF NEW.project_id='${f.projectId}'::uuid AND OLD.state='IN_REVIEW' AND NEW.state='PUBLISHED' THEN
            PERFORM pg_catalog.pg_sleep(5.2);
          END IF;
          RETURN NEW;
        END $$`);
      await tx.$executeRawUnsafe(`REVOKE ALL ON FUNCTION registry_private.${fn}() FROM PUBLIC,anon,authenticated,service_role`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON public.project_drafts
        FOR EACH ROW EXECUTE FUNCTION registry_private.${fn}()`);
    });
    try { await work(); }
    finally {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON public.project_drafts`);
        await tx.$executeRawUnsafe(`DROP FUNCTION registry_private.${fn}()`);
      });
      const [remaining] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_proc
        WHERE pronamespace='registry_private'::regnamespace AND proname=${fn}`;
      expect(remaining.count).toBe(0);
    }
  }
  beforeAll(async () => {
    db = createIntegrationPrisma(); service = client(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
    owner = await createActor(); editor = await createActor(); reviewer = await createActor(); viewer = await createActor();
    publisher = await createActor(); outsider = await createActor(); unqualified = await createActor(false);
    await db.profile.update({ where: { id: unqualified.id }, data: { role: "ADMIN" } });
    vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true");
    vi.stubEnv("REGISTRY_DRAFT_REVIEW_ENABLED", "true");
  }, 60000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!db) return;
    try {
      // Test-only superuser cleanup: only this suite's synthetic IDs. Runtime has
      // no trigger bypass/delete entry point and cannot remove immutable history.
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
        await tx.$executeRaw`DELETE FROM registry_private.command_receipts WHERE project_id=ANY(${projects}::uuid[])`;
        await tx.$executeRaw`DELETE FROM registry_private.review_invalidations WHERE project_id=ANY(${projects}::uuid[])`;
        await tx.$executeRaw`DELETE FROM registry_private.operator_actions WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
        for (const table of [...registryTables].reverse()) {
          const column = table === "projects" ? "id" : "project_id";
          await tx.$executeRawUnsafe(`DELETE FROM public.${table} WHERE ${column}=ANY($1::uuid[])`, projects);
        }
        await tx.$executeRaw`DELETE FROM registry_private.internal_operators WHERE subject_id=ANY(${actors.map(a => a.id)}::uuid[])`;
      });
      for (const actor of actors) expect((await service.auth.admin.deleteUser(actor.id)).error).toBeNull();
    } finally { await db.$disconnect(); }
  }, 60000);

  it("keeps both command flags default-deny and exposes only an initialized safe DraftDTO", async () => {
    const f = await fixture();
    for (const flag of ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_DRAFT_REVIEW_ENABLED"]) {
      vi.stubEnv(flag, "");
      try { await denied(getRegistryDraftHead(access(owner, f)), "DISABLED"); }
      finally { vi.stubEnv(flag, "true"); }
    }
    const current = await getRegistryDraft(access(owner, f));
    expect(draftDTOSchema.parse(current.result)).toEqual(current.result);
    expect(current.etag).toBe(`"draft:${f.draftId}:1"`);
    expect(JSON.stringify(current)).not.toMatch(/ownerId|updatedBy|storageRef|credential|accessToken/);
    await db.$executeRaw`UPDATE public.project_drafts SET manifest='{}'::jsonb,presentation='{}'::jsonb WHERE id=${f.draftId}::uuid`;
    expect((await getRegistryDraftHead(access(owner, f))).result.id).toBe(f.draftId);
    await denied(getRegistryDraft(access(owner, f)), "DRAFT_UNINITIALIZED");
  });
  it("rejects forged JWT subjects/roles, unsigned tokens and caller ownership fields", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    const [header, raw, signature] = owner.token.split("."), claims = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    for (const forged of [
      `${header}.${Buffer.from(JSON.stringify({ ...claims, sub: outsider.id })).toString("base64url")}.${signature}`,
      `${header}.${Buffer.from(JSON.stringify({ ...claims, role: "service_role" })).toString("base64url")}.${signature}`,
      `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${raw}.`,
    ]) await denied(getRegistryDraftHead({ accessToken: forged, projectId: f.projectId }), "AUTH_REQUIRED");
    await denied(editRegistryDraft(command(owner, f, current.etag, { ...f.payload, ownerId: outsider.id })), "INVALID_INPUT");
    await denied(editRegistryDraft(command(owner, f, current.etag, { ...f.payload, manifest: { ...f.payload.manifest, storageRef: "private/forged" } })), "INVALID_INPUT");
    expect((await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).revision).toBe(1);
  });
  it("separates project roles from operator actions and ADMIN/user_metadata", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    for (const actor of [viewer, publisher, reviewer]) {
      expect((await getRegistryDraft(access(actor, f))).result.projectId).toBe(f.projectId);
      await denied(editRegistryDraft(command(actor, f, current.etag, changed(f, "forbidden"))), ["FORBIDDEN", "NOT_FOUND"]);
    }
    expect((await unqualified.client.auth.updateUser({ data: { internal: true, role: "OWNER", actions } })).error).toBeNull();
    await denied(getRegistryDraft(access(unqualified, f)), "FORBIDDEN");
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${editor.id}::uuid AND action='EDIT_DRAFT'`;
    try { await denied(editRegistryDraft(command(editor, f, current.etag, changed(f, "forbidden"))), "FORBIDDEN"); }
    finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET active=true WHERE subject_id=${editor.id}::uuid AND action='EDIT_DRAFT'`; }
  });
  it("hides cross-project Draft and Review access and rejects a foreign review ID", async () => {
    const f = await fixture(), other = await fixture(), approval = await approved(f);
    await denied(getRegistryDraft(access(outsider, f)), ["NOT_FOUND", "FORBIDDEN"]);
    await denied(getRegistryReview({ ...access(outsider, f), reviewId: approval.reviewId }), ["NOT_FOUND", "FORBIDDEN"]);
    await denied(getRegistryReview({ ...access(owner, other), reviewId: approval.reviewId }), "NOT_FOUND");
    await denied(sealRegistryVersion(command(owner, other, (await getRegistryDraft(access(owner, other))).etag,
      { reviewId: approval.reviewId, expectedContentHash: approval.contentHash })), ["NOT_FOUND", "REVIEW_INVALID"]);
    expect(await db.projectVersion.count({ where: { projectId: { in: [f.projectId, other.projectId] } } })).toBe(0);
  });
  it("rejects missing/weak/stale preconditions without mutating the draft", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    await denied(editRegistryDraft(command(owner, f, "", changed(f, "missing"))), "PRECONDITION_REQUIRED");
    await denied(editRegistryDraft(command(owner, f, `W/${current.etag}`, changed(f, "weak"))), ["PRECONDITION_REQUIRED", "PRECONDITION_FAILED", "INVALID_INPUT"]);
    const edited = await editRegistryDraft(command(owner, f, current.etag, changed(f, "winner")));
    await denied(editRegistryDraft(command(owner, f, current.etag, changed(f, "stale"))), "PRECONDITION_FAILED");
    expect((await getRegistryDraft(access(owner, f))).result).toEqual(edited.result);
  });
  it("enforces strict JSON text and project identity before any stored draft edit", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    const duplicated = JSON.stringify(f.payload).replace('{"manifest":', '{"manifest":{},"manifest":');
    await denied(editRegistryDraft(command(owner, f, current.etag, duplicated)), "INVALID_INPUT");
    await denied(editRegistryDraft(command(owner, f, current.etag,
      { ...f.payload, presentation: { ...f.payload.presentation, title: "\uD800" } })), "INVALID_INPUT");
    await denied(editRegistryDraft(command(owner, f, current.etag,
      { ...f.payload, manifest: { ...f.payload.manifest, slug: "forged-slug" } })), "INVALID_INPUT");
    await denied(editRegistryDraft(command(owner, f, current.etag,
      { ...f.payload, manifest: { ...f.payload.manifest, projectId: randomUUID() } })), "INVALID_INPUT");
    expect((await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).revision).toBe(1);
    const valid = await editRegistryDraft(command(owner, f, current.etag, JSON.stringify(changed(f, "strict JSON accepted"))));
    expect(valid.result.payload.presentation.title).toBe("strict JSON accepted");
  });
  it("serializes concurrent CAS editors so exactly one revision wins", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    const results = await Promise.allSettled([
      editRegistryDraft(command(owner, f, current.etag, changed(f, "owner race"))),
      editRegistryDraft(command(editor, f, current.etag, changed(f, "editor race"))),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(RegistryProtocolError); expect(rejected.reason.code).toBe("PRECONDITION_FAILED");
    expect((await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).revision).toBe(2);
  });
  it("recovers a lost edit response from one atomic receipt without a second write", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    const request = command(owner, f, current.etag, changed(f, "one durable edit"));
    const first = await editRegistryDraft(request), replay = await editRegistryDraft(request);
    expect(first.replayed).toBe(false); expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual(first.result); expect(replay.etag).toBe(first.etag);
    expect((await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).revision).toBe(2);
    const [receipt] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.command_receipts
      WHERE project_id=${f.projectId}::uuid AND actor_id=${owner.id}::uuid AND idempotency_key=${request.idempotencyKey}`;
    expect(receipt.count).toBe(1);
    await expect(db.$executeRaw`UPDATE registry_private.command_receipts SET result='{}'::jsonb WHERE project_id=${f.projectId}::uuid`).rejects.toThrow();
    await expect(db.$executeRaw`DELETE FROM registry_private.command_receipts WHERE project_id=${f.projectId}::uuid`).rejects.toThrow();
  });
  it("coalesces simultaneous identical idempotency keys to a single committed mutation", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    const request = command(owner, f, current.etag, changed(f, "same-key race"));
    const results = await Promise.all([editRegistryDraft(request), editRegistryDraft(request)]);
    expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
    expect(results[0].result).toEqual(results[1].result);
    expect((await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).revision).toBe(2);
  });
  it("rejects key reuse with another payload or action and scopes keys to actor/project", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f)), key = randomUUID();
    const edited = await editRegistryDraft(command(owner, f, current.etag, changed(f, "first"), key));
    await denied(editRegistryDraft(command(owner, f, current.etag, changed(f, "different"), key)), "IDEMPOTENCY_CONFLICT");
    await denied(submitRegistryDraft(command(owner, f, edited.etag, { expectedContentHash: hashSnapshot(edited.result.payload) }, key)), "IDEMPOTENCY_CONFLICT");
    expect((await editRegistryDraft(command(editor, f, edited.etag, changed(f, "different actor"), key))).replayed).toBe(false);
    const other = await fixture(), otherDraft = await getRegistryDraft(access(owner, other));
    expect((await editRegistryDraft(command(owner, other, otherDraft.etag, changed(other, "different project"), key))).replayed).toBe(false);
  });
  it("rechecks qualification before receipt replay and never revives an old epoch", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    const request = command(owner, f, current.etag, changed(f, "receipt before revoke"));
    await editRegistryDraft(request);
    await db.$executeRaw`UPDATE registry_private.internal_operators SET active=false WHERE subject_id=${owner.id}::uuid`;
    try { await denied(editRegistryDraft(request), "FORBIDDEN"); }
    finally { await db.$executeRaw`UPDATE registry_private.internal_operators SET active=true WHERE subject_id=${owner.id}::uuid`; }
    await denied(editRegistryDraft(request), "REPLAY_STALE");
  });
  it("rechecks revoked membership and per-action qualification before replay", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(editor, f));
    const request = command(editor, f, current.etag, changed(f, "member receipt"));
    await editRegistryDraft(request);
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: f.projectId, subjectId: editor.id } }, data: { active: false } });
    await denied(editRegistryDraft(request), ["FORBIDDEN", "NOT_FOUND"]);
    await db.projectMembership.update({ where: { projectId_subjectId: { projectId: f.projectId, subjectId: editor.id } }, data: { active: true } });
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${editor.id}::uuid AND action='EDIT_DRAFT'`;
    try { await denied(editRegistryDraft(request), "FORBIDDEN"); }
    finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET active=true WHERE subject_id=${editor.id}::uuid AND action='EDIT_DRAFT'`; }
    await denied(editRegistryDraft(request), "REPLAY_STALE");
  });
  it("denies an already-issued JWT after its actual Auth session is revoked", async () => {
    const actor = await createActor(), f = await fixture();
    await db.projectMembership.create({ data: { projectId: f.projectId, subjectId: actor.id, roles: ["EDITOR"] } });
    const current = await getRegistryDraft(access(actor, f)), request = command(actor, f, current.etag, changed(f, "before logout"));
    await editRegistryDraft(request);
    expect(await db.$executeRaw`DELETE FROM auth.sessions WHERE id=${actor.sessionId}::uuid AND user_id=${actor.id}::uuid`).toBe(1);
    await denied(getRegistryDraft(access(actor, f)), "AUTH_REQUIRED");
    await denied(editRegistryDraft(request), "AUTH_REQUIRED");
  });
  it("denies an expired database Auth session even while its signed JWT has not expired", async () => {
    const actor = await createActor(), f = await fixture();
    await db.projectMembership.create({ data: { projectId: f.projectId, subjectId: actor.id, roles: ["VIEWER"] } });
    expect((await getRegistryDraft(access(actor, f))).result.projectId).toBe(f.projectId);
    expect(await db.$executeRaw`UPDATE auth.sessions SET not_after=now()-interval '1 second'
      WHERE id=${actor.sessionId}::uuid AND user_id=${actor.id}::uuid`).toBe(1);
    await denied(getRegistryDraftHead(access(actor, f)), "AUTH_REQUIRED");
  });
  it("rejects a wrong expected content hash and freezes a submitted draft", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f));
    await denied(submitRegistryDraft(command(owner, f, current.etag, { expectedContentHash: "0".repeat(64) })), "HASH_MISMATCH");
    expect(await db.publicationReview.count({ where: { projectId: f.projectId } })).toBe(0);
    const submitted = await submitRegistryDraft(command(owner, f, current.etag, { expectedContentHash: hashSnapshot(f.payload) }));
    expect((await getRegistryDraft(access(owner, f))).result.state).toBe("IN_REVIEW");
    await denied(editRegistryDraft(command(editor, f, submitted.etag, changed(f, "illegal while reviewing"))), "CONFLICT");
    await denied(decideRegistryReview(command(reviewer, f, submitted.etag,
      { reviewId: submitted.result.id, decision: "APPROVED", expectedContentHash: "0".repeat(64) })), "HASH_MISMATCH");
  });
  it("rejects self-review even when the submitter independently holds REVIEWER", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f)), expectedContentHash = hashSnapshot(f.payload);
    const submitted = await submitRegistryDraft(command(owner, f, current.etag, { expectedContentHash }));
    await denied(decideRegistryReview(command(owner, f, submitted.etag,
      { reviewId: submitted.result.id, decision: "APPROVED", expectedContentHash })), ["FORBIDDEN", "REVIEW_INVALID"]);
    expect((await db.publicationReview.findUniqueOrThrow({ where: { id: submitted.result.id } })).decision).toBe("PENDING");
  });
  it("serializes conflicting review decisions without overwriting the winning history", async () => {
    const f = await fixture(), current = await getRegistryDraft(access(owner, f)), expectedContentHash = hashSnapshot(f.payload);
    const submitted = await submitRegistryDraft(command(owner, f, current.etag, { expectedContentHash }));
    const results = await Promise.allSettled(["APPROVED", "REJECTED"].map(decision => decideRegistryReview(command(reviewer, f, submitted.etag,
      { reviewId: submitted.result.id, decision, expectedContentHash }))));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(RegistryProtocolError);
    expect(["REVIEW_INVALID", "CONFLICT"]).toContain(rejected.reason.code);
    const winner = results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof decideRegistryReview>>>;
    expect((await db.publicationReview.findUniqueOrThrow({ where: { id: submitted.result.id } })).decision).toBe(winner.value.result.decision);
  });
  it("withdraws approved review using immutable invalidation instead of rewriting approval", async () => {
    const f = await fixture(), approval = await approved(f);
    const before = await db.publicationReview.findUniqueOrThrow({ where: { id: approval.reviewId } });
    const withdrawn = await withdrawRegistryReview(command(owner, f, approval.etag, { reviewId: approval.reviewId }));
    expect((await getRegistryDraft(access(owner, f))).result.state).toBe("DRAFT");
    expect(await db.publicationReview.findUniqueOrThrow({ where: { id: approval.reviewId } })).toEqual(before);
    expect((await getRegistryReview({ ...access(owner, f), reviewId: approval.reviewId })).result.effectiveState).toBe("INVALIDATED");
    await denied(decideRegistryReview(approval.decisionRequest), "REPLAY_STALE");
    await denied(sealRegistryVersion(command(owner, f, withdrawn.etag,
      { reviewId: approval.reviewId, expectedContentHash: approval.contentHash })), "REVIEW_INVALID");
    await expect(db.$executeRaw`DELETE FROM registry_private.review_invalidations WHERE review_id=${approval.reviewId}::uuid`).rejects.toThrow();
    await expect(db.projectVersion.create({ data: { projectId: f.projectId, version: "1.0.0", snapshot: f.payload,
      contentHash: approval.contentHash, reviewId: approval.reviewId } })).rejects.toThrow();
  });
  it("rechecks natural operator expiry at sealing without relying on an UPDATE epoch", async () => {
    await db.$executeRaw`UPDATE registry_private.internal_operators SET expires_at=now()+interval '5 seconds' WHERE subject_id=${reviewer.id}::uuid`;
    try {
      const f = await fixture(), approval = await approved(f);
      const before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
      await new Promise(resolve => setTimeout(resolve, 5100));
      expect((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).authzEpoch).toBe(before.authzEpoch);
      await denied(sealRegistryVersion(command(owner, f, approval.etag,
        { reviewId: approval.reviewId, expectedContentHash: approval.contentHash })), ["REVIEW_INVALID", "FORBIDDEN"]);
      expect((await getRegistryReview({ ...access(owner, f), reviewId: approval.reviewId })).result.effectiveState).toBe("INVALIDATED");
    } finally { await db.$executeRaw`UPDATE registry_private.internal_operators SET expires_at=now()+interval '1 hour' WHERE subject_id=${reviewer.id}::uuid`; }
  }, 20000);
  it("rechecks natural per-action expiry for the original reviewer before sealing", async () => {
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=now()+interval '5 seconds'
      WHERE subject_id=${reviewer.id}::uuid AND action='DECIDE_REVIEW'`;
    try {
      const f = await fixture(), approval = await approved(f);
      const before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
      await new Promise(resolve => setTimeout(resolve, 5100));
      expect((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).authzEpoch).toBe(before.authzEpoch);
      await denied(sealRegistryVersion(command(owner, f, approval.etag,
        { reviewId: approval.reviewId, expectedContentHash: approval.contentHash })), ["REVIEW_INVALID", "FORBIDDEN"]);
    } finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=now()+interval '1 hour'
      WHERE subject_id=${reviewer.id}::uuid AND action='DECIDE_REVIEW'`; }
  }, 20000);
  it("rolls back a seal when reviewer action expires during this draft's final freeze", async () => {
    await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '5 seconds'
      WHERE subject_id=${reviewer.id}::uuid AND action='DECIDE_REVIEW'`;
    try {
      const f = await fixture(), approval = await approved(f);
      const before = await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } });
      const key = randomUUID();
      await delayOnlyThisDraftFreeze(f, async () => {
        const started = performance.now();
        await denied(sealRegistryVersion(command(owner, f, approval.etag,
          { reviewId: approval.reviewId, expectedContentHash: approval.contentHash }, key)), ["FORBIDDEN", "REVIEW_INVALID"]);
        // Rejecting before reaching the scoped slow trigger would not prove the
        // final post-write check. The actual command must cross the expiry.
        expect(performance.now() - started).toBeGreaterThanOrEqual(5000);
      });
      expect(await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).toEqual(before);
      expect(await db.projectVersion.count({ where: { projectId: f.projectId } })).toBe(0);
      const [receipt] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.command_receipts
        WHERE project_id=${f.projectId}::uuid AND idempotency_key=${key}`;
      expect(receipt.count).toBe(0);
    } finally { await db.$executeRaw`UPDATE registry_private.operator_actions SET expires_at=clock_timestamp()+interval '1 hour'
      WHERE subject_id=${reviewer.id}::uuid AND action='DECIDE_REVIEW'`; }
  }, 25000);
  it("rolls back a seal when its review expires after freshness but before commit", async () => {
    const f = await fixture(), expectedContentHash = hashSnapshot(f.payload);
    const draft = await db.projectDraft.update({ where: { id: f.draftId }, data: { state: "IN_REVIEW" } });
    const project = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    const [clock] = await db.$queryRaw<{ expires: Date }[]>`SELECT clock_timestamp()+interval '5 seconds' AS expires`;
    const review = await db.publicationReview.create({ data: { projectId: f.projectId, draftId: draft.id, draftRevision: draft.revision,
      authzEpoch: project.authzEpoch, snapshotHash: expectedContentHash, visibility: "PRIVATE", assetDigestSet: [],
      submitterId: owner.id, policyRevision: 1, expiresAt: clock.expires } });
    const decided = await decideRegistryReview(command(reviewer, f, `"draft:${draft.id}:${draft.revision}"`,
      { reviewId: review.id, decision: "APPROVED", expectedContentHash }));
    const before = await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } }), key = randomUUID();
    await delayOnlyThisDraftFreeze(f, async () => {
      const started = performance.now();
      await denied(sealRegistryVersion(command(owner, f, decided.etag,
        { reviewId: review.id, expectedContentHash }, key)), "REVIEW_INVALID");
      expect(performance.now() - started).toBeGreaterThanOrEqual(5000);
    });
    expect(await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).toEqual(before);
    expect(await db.projectVersion.count({ where: { projectId: f.projectId } })).toBe(0);
    expect((await db.publicationReview.findUniqueOrThrow({ where: { id: review.id } })).decision).toBe("APPROVED");
    const [receipt] = await db.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM registry_private.command_receipts
      WHERE project_id=${f.projectId}::uuid AND idempotency_key=${key}`;
    expect(receipt.count).toBe(0);
  }, 25000);
  it("does not restore approval after a reviewer role is revoked and regranted", async () => {
    const f = await fixture(), approval = await approved(f);
    for (const roles of [["VIEWER"], ["REVIEWER"]] as const) await db.projectMembership.update({
      where: { projectId_subjectId: { projectId: f.projectId, subjectId: reviewer.id } }, data: { roles: [...roles] },
    });
    await denied(sealRegistryVersion(command(owner, f, approval.etag,
      { reviewId: approval.reviewId, expectedContentHash: approval.contentHash })), "REVIEW_INVALID");
  });
  it("rejects a review bound to another policy revision without rewriting its immutable binding", async () => {
    const f = await fixture(), expectedContentHash = hashSnapshot(f.payload);
    const draft = await db.projectDraft.update({ where: { id: f.draftId }, data: { state: "IN_REVIEW" } });
    const project = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    const review = await db.publicationReview.create({ data: { projectId: f.projectId, draftId: draft.id, draftRevision: draft.revision,
      authzEpoch: project.authzEpoch, snapshotHash: expectedContentHash, visibility: "PRIVATE", assetDigestSet: [],
      submitterId: owner.id, policyRevision: 2, expiresAt: new Date(Date.now() + 3600000) } });
    const current = await getRegistryDraftHead(access(owner, f));
    await denied(decideRegistryReview(command(reviewer, f, current.etag,
      { reviewId: review.id, decision: "APPROVED", expectedContentHash })), "REVIEW_INVALID");
    expect((await getRegistryReview({ ...access(owner, f), reviewId: review.id })).result.effectiveState).toBe("INVALIDATED");
    expect((await db.publicationReview.findUniqueOrThrow({ where: { id: review.id } })).policyRevision).toBe(2);
  });
  it("rejects an expired review using the real database clock", async () => {
    const f = await fixture(), expectedContentHash = hashSnapshot(f.payload);
    const draft = await db.projectDraft.update({ where: { id: f.draftId }, data: { state: "IN_REVIEW" } });
    const project = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    const [clock] = await db.$queryRaw<{ expires: Date }[]>`SELECT clock_timestamp()+interval '1 second' AS expires`;
    const review = await db.publicationReview.create({ data: { projectId: f.projectId, draftId: draft.id, draftRevision: draft.revision,
      authzEpoch: project.authzEpoch, snapshotHash: expectedContentHash, visibility: "PRIVATE", assetDigestSet: [],
      submitterId: owner.id, policyRevision: 1, expiresAt: clock.expires } });
    await new Promise(resolve => setTimeout(resolve, 1100));
    await denied(decideRegistryReview(command(reviewer, f, (await getRegistryDraftHead(access(owner, f))).etag,
      { reviewId: review.id, decision: "APPROVED", expectedContentHash })), "REVIEW_INVALID");
    expect((await db.publicationReview.findUniqueOrThrow({ where: { id: review.id } })).decision).toBe("PENDING");
  });
  it("rejects a shape-valid review whose stored hash is not the canonical draft hash", async () => {
    const f = await fixture(), expectedContentHash = hashSnapshot(f.payload);
    const draft = await db.projectDraft.update({ where: { id: f.draftId }, data: { state: "IN_REVIEW" } });
    const project = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    const review = await db.publicationReview.create({ data: { projectId: f.projectId, draftId: draft.id, draftRevision: draft.revision,
      authzEpoch: project.authzEpoch, snapshotHash: "0".repeat(64), visibility: "PRIVATE", assetDigestSet: [],
      submitterId: owner.id, policyRevision: 1, expiresAt: new Date(Date.now() + 3600000) } });
    await denied(decideRegistryReview(command(reviewer, f, (await getRegistryDraftHead(access(owner, f))).etag,
      { reviewId: review.id, decision: "APPROVED", expectedContentHash })), "HASH_MISMATCH");
    expect(await db.projectVersion.count({ where: { projectId: f.projectId } })).toBe(0);
  });
  it("serializes withdrawal against sealing so invalidation cannot authorize a version", async () => {
    const f = await fixture(), approval = await approved(f);
    const results = await Promise.allSettled([
      withdrawRegistryReview(command(owner, f, approval.etag, { reviewId: approval.reviewId })),
      sealRegistryVersion(command(owner, f, approval.etag, { reviewId: approval.reviewId, expectedContentHash: approval.contentHash })),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const [facts] = await db.$queryRaw<{ invalidated: boolean; versions: number }[]>`SELECT
      EXISTS(SELECT 1 FROM registry_private.review_invalidations WHERE review_id=${approval.reviewId}::uuid) AS invalidated,
      (SELECT count(*)::int FROM public.project_versions WHERE project_id=${f.projectId}::uuid) AS versions`;
    expect(facts.invalidated ? facts.versions === 0 : facts.versions === 1).toBe(true);
  });
  it("rejects foreign, non-curated or unsafe referenced assets before accepting an edit", async () => {
    const f = await fixture(), other = await fixture(), current = await getRegistryDraft(access(owner, f));
    for (const bad of [await asset(other), await asset(f, "text/markdown", "PRIVATE_USER_DATA"), await asset(f, "text/html")]) {
      const payload = { ...f.payload, documentation: [{ id: randomUUID(), title: "Readme", language: "en", assetId: bad.id }] };
      await denied(editRegistryDraft(command(owner, f, current.etag, payload)), ["INVALID_INPUT", "REVIEW_INVALID"]);
    }
    expect((await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).revision).toBe(1);
  });
  it("invalidates approval when an approved referenced asset is retired", async () => {
    const f = await fixture(), markdown = await asset(f), current = await getRegistryDraft(access(owner, f));
    await editRegistryDraft(command(owner, f, current.etag, { ...f.payload,
      documentation: [{ id: randomUUID(), title: "Readme", language: "en", assetId: markdown.id }] }));
    const approval = await approved(f);
    await db.projectAsset.update({ where: { id: markdown.id }, data: { state: "RETIRED" } });
    expect((await getRegistryReview({ ...access(owner, f), reviewId: approval.reviewId })).result.effectiveState).toBe("INVALIDATED");
    await denied(sealRegistryVersion(command(owner, f, approval.etag,
      { reviewId: approval.reviewId, expectedContentHash: approval.contentHash })), ["REVIEW_INVALID", "INVALID_INPUT"]);
    expect(await db.projectVersion.count({ where: { projectId: f.projectId } })).toBe(0);
  });
  it("seals canonical immutable Version and documentation once without publishing a Release", async () => {
    const f = await fixture(), markdown = await asset(f), current = await getRegistryDraft(access(owner, f));
    await editRegistryDraft(command(owner, f, current.etag, { ...f.payload,
      documentation: [{ id: randomUUID(), title: "Readme", language: "en", assetId: markdown.id }] }));
    const approval = await approved(f);
    const request = command(owner, f, approval.etag, { reviewId: approval.reviewId, expectedContentHash: approval.contentHash });
    const sealed = await sealRegistryVersion(request), replay = await sealRegistryVersion(request);
    expect(versionDTOSchema.parse(sealed.result)).toEqual(sealed.result);
    expect(sealed.result.contentHash).toBe(hashSnapshot(sealed.result.snapshot));
    expect(replay.replayed).toBe(true); expect(replay.result).toEqual(sealed.result);
    expect(await db.projectVersion.count({ where: { projectId: f.projectId } })).toBe(1);
    expect((await db.projectDraft.findUniqueOrThrow({ where: { id: f.draftId } })).state).toBe("PUBLISHED");
    expect((await getRegistryReview({ ...access(owner, f), reviewId: approval.reviewId })).result.effectiveState).toBe("SEALED");
    expect(await db.projectRelease.count({ where: { projectId: f.projectId } })).toBe(0);
    const project = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    expect(project.visibility).toBe("PRIVATE"); expect(project.currentReleaseId).toBeNull();
    const documents = await db.projectDocumentation.findMany({ where: { versionId: sealed.result.id } });
    expect(documents).toHaveLength(1); expect(documents[0].contentHash).toBe(markdown.deliveryDigest);
    expect(documents[0].id).toBe(sealed.result.snapshot.documentation[0].id);
    await expect(db.projectVersion.update({ where: { id: sealed.result.id }, data: { snapshot: {} } })).rejects.toThrow();
    await expect(db.projectVersion.delete({ where: { id: sealed.result.id } })).rejects.toThrow();
    await expect(db.projectDocumentation.create({ data: { projectId: f.projectId, versionId: sealed.result.id,
      title: "late append", language: "en", assetId: markdown.id, contentHash: markdown.deliveryDigest } })).rejects.toThrow();
  });
  it("keeps command receipts, qualifications and invalidations private and append-only", async () => {
    const rows = await db.$queryRaw<{ relname: string; rls: boolean; anon: boolean; authenticated: boolean; service: boolean }[]>`
      SELECT c.relname,c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,
        has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated,
        has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS service
      FROM pg_class c WHERE c.relnamespace='registry_private'::regnamespace
        AND c.relname IN ('operator_actions','command_receipts','review_invalidations')`;
    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.rls && !row.anon && !row.authenticated && !row.service)).toBe(true);
    for (const actor of [client(), owner.client, service]) {
      expect((await actor.schema("registry_private").from("command_receipts").select("*")).error).not.toBeNull();
      expect((await actor.rpc("sealRegistryVersion", { projectId: projects[0] })).error).not.toBeNull();
    }
    await expect(db.$executeRaw`DELETE FROM registry_private.operator_actions WHERE subject_id=${owner.id}::uuid`).rejects.toThrow();
  });
});
