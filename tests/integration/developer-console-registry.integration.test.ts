/*
 * P1-D3-A acceptance: the developer console's browser read client and stores against the real
 * internal read HTTP handler, real Supabase Auth sessions and the isolated PostgreSQL database.
 * Only fetch is substituted (it calls the handler in-process); everything the console accepts here
 * is what the production route serializes.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

import { createRegistryReadAdapter } from "@/features/developer-console/registry/adapter";
import { createOverviewStore, createProjectStore } from "@/features/developer-console/registry/store";
import { draftAgreement } from "@/features/developer-console/registry/view";
import { hashSnapshot } from "@/features/registry/canonical";
import type { DraftPayload } from "@/features/registry/contracts";
import { decideRegistryReview, getRegistryDraft, sealRegistryVersion, submitRegistryDraft } from "@/features/registry/protocol";
import { REGISTRY_ACTION_ROLES } from "@/features/registry/read-contracts";
import { createRegistryReadHandler } from "@/features/registry/read-http";
import { approveRegistryRelease, getRegistryReleaseHead, publishRegistryRelease, requestRegistryReleaseApproval } from "@/features/registry/release";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real console-read Auth/database environment required");
if (enabled && ![process.env.TEST_DATABASE_URL!, process.env.SUPABASE_TEST_URL!]
  .every((value) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname))) {
  throw new Error("Console read acceptance requires loopback-only disposable endpoints");
}

type Actor = { id: string; token: string; client: SupabaseClient };
const actions = Object.keys(REGISTRY_ACTION_ROLES);
const tables = ["projects", "project_drafts", "project_versions", "project_releases", "project_assets", "project_documentation", "project_memberships", "publication_reviews"];
const ORIGIN = "http://127.0.0.1:3000";

describe.skipIf(!enabled)("Developer console Registry read mode with real Auth sessions and isolated PostgreSQL", () => {
  let db: PrismaClient, service: SupabaseClient;
  let owner: Actor, reviewer: Actor;
  let projectId: string, payload: DraftPayload, versionId: string, releaseId: string, requestId: string;
  const actors: Actor[] = [], projects: string[] = [];
  const anon = (key = process.env.SUPABASE_TEST_ANON_KEY!) => createClient(process.env.SUPABASE_TEST_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  /** The console adapter as the browser builds it, with fetch answered by the real route handler. */
  function consoleFor(actor: Actor) {
    const handler = createRegistryReadHandler();
    const sent: Request[] = [];
    const adapter = createRegistryReadAdapter({
      getAccessToken: async () => actor.token,
      fetch: async (input, init = {}) => {
        const url = new URL(String(input), ORIGIN);
        expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", redirect: "error" });
        const request = new Request(url, { method: "GET", headers: { ...(init.headers as Record<string, string>), "Sec-Fetch-Site": "same-origin" } });
        sent.push(request);
        return handler(request, url.pathname.replace(/^\/api\/internal\/registry\/?/, "").split("/").filter(Boolean));
      },
    });
    return { adapter, sent, project: (id = projectId) => createProjectStore(adapter.client, id), overview: () => createOverviewStore(adapter.client) };
  }

  async function createActor(granted: string[] = actions): Promise<Actor> {
    const email = `console-read-${randomUUID()}@example.test`, password = `Aa!${randomUUID()}z9`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(made.error).toBeNull();
    const signed = anon(), login = await signed.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const actor = { id: made.data.user!.id, token: login.data.session!.access_token, client: signed };
    actors.push(actor);
    await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
      VALUES(${actor.id}::uuid,true,true,clock_timestamp()+interval '1 hour')`;
    for (const action of granted) await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
      VALUES(${actor.id}::uuid,${action},true,clock_timestamp()+interval '1 hour')`;
    return actor;
  }
  async function member(actor: Actor, roles: ("REVIEWER" | "VIEWER")[]) {
    await db.projectMembership.create({ data: { projectId, subjectId: actor.id, roles } });
  }

  beforeAll(async () => {
    db = createIntegrationPrisma(); service = anon(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.SUPABASE_TEST_URL!);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.SUPABASE_TEST_ANON_KEY!);
    for (const flag of ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_INTERNAL_READ_ENABLED", "REGISTRY_INTERNAL_READ_HTTP_ENABLED",
      "REGISTRY_DRAFT_REVIEW_ENABLED", "REGISTRY_RELEASE_COMMANDS_ENABLED"]) vi.stubEnv(flag, "true");
    owner = await createActor(); reviewer = await createActor();
    const project = await db.project.create({ data: { slug: `console-${randomUUID()}`, ownerId: owner.id } });
    projectId = project.id; projects.push(projectId);
    await member(reviewer, ["REVIEWER"]);
    payload = {
      manifest: { schemaVersion: "0.5.0", projectId, slug: project.slug, version: "1.0.0", name: "Console read acceptance",
        summary: "Synthetic isolated console read fixture", category: "software", visibility: "PRIVATE", integration: { mode: "SHOWCASE" },
        capabilities: ["documentation.read"], researchClaims: [] },
      presentation: { schemaVersion: "0.5.0", projectId, version: "1.0.0", title: "Console read acceptance", sections: [] }, documentation: [],
    };
    await db.projectDraft.create({ data: { projectId, updatedBy: owner.id, manifest: payload.manifest, presentation: payload.presentation, documentation: payload.documentation } });
    // Real history through the existing commands: review → seal → request → approve → publish.
    const access = (actor: Actor) => ({ accessToken: actor.token, projectId });
    const command = (actor: Actor, etag: string, input: unknown) => ({ ...access(actor), ifMatch: etag, idempotencyKey: randomUUID(), input });
    const draft = await getRegistryDraft(access(owner));
    const submitted = await submitRegistryDraft(command(owner, draft.etag, { expectedContentHash: draft.contentHash }));
    const decided = await decideRegistryReview(command(reviewer, submitted.etag, { reviewId: submitted.result.id, decision: "APPROVED", expectedContentHash: draft.contentHash }));
    const sealed = await sealRegistryVersion(command(owner, decided.etag, { reviewId: submitted.result.id, expectedContentHash: draft.contentHash }));
    versionId = sealed.result.id;
    const head = await getRegistryReleaseHead(access(owner));
    const request = await requestRegistryReleaseApproval(command(owner, head.etag, { versionId, expectedContentHash: draft.contentHash, intent: "PUBLISH" }));
    requestId = request.result.id;
    const approval = await approveRegistryRelease(command(reviewer, request.etag, { requestId }));
    const published = await publishRegistryRelease(command(owner, approval.etag, { approvalId: approval.result.id }));
    releaseId = published.result.id;
  }, 90000);

  afterAll(async () => {
    vi.unstubAllEnvs(); if (!db) return;
    try {
      // Only guarded disposable fixtures are removed; no production endpoint is accepted.
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
        for (const table of ["release_receipts", "release_withdrawals", "release_approvals", "release_requests", "command_receipts", "review_invalidations"]) {
          await tx.$executeRawUnsafe(`DELETE FROM registry_private.${table} WHERE project_id=ANY($1::uuid[])`, projects);
        }
        await tx.$executeRaw`DELETE FROM registry_private.operator_actions WHERE subject_id=ANY(${actors.map((a) => a.id)}::uuid[])`;
        for (const table of [...tables].reverse()) await tx.$executeRawUnsafe(
          `DELETE FROM public.${table} WHERE ${table === "projects" ? "id" : "project_id"}=ANY($1::uuid[])`, projects);
        await tx.$executeRaw`DELETE FROM registry_private.internal_operators WHERE subject_id=ANY(${actors.map((a) => a.id)}::uuid[])`;
      });
      for (const actor of actors) expect((await service.auth.admin.deleteUser(actor.id)).error).toBeNull();
    } finally { await db.$disconnect(); }
  }, 60000);

  it("reads every section through the console stores, with the server's hash, ETags and viewer-relative facts", async () => {
    const { overview, project, sent } = consoleFor(owner);
    const list = overview();
    await list.refresh();
    const o = list.getSnapshot();
    expect(o.gate).toBeNull();
    expect(o.qualifications.data?.map((item) => item.action).sort()).toEqual([...actions].sort());
    expect(o.projects.items.map((item) => item.id)).toContain(projectId);

    const store = project();
    await store.refresh();
    const s = store.getSnapshot();
    for (const slot of [s.project, s.draftHead, s.draft, s.reviews, s.versions, s.releaseHead, s.releases, s.requests]) expect(slot).toMatchObject({ status: "ready", error: null });
    expect(s.project.data?.roles).toEqual(["OWNER"]);
    expect(s.draftHead.data).toMatchObject({ state: "PUBLISHED", contentHash: hashSnapshot(payload) });
    expect(s.draft.data?.contentHash).toBe(hashSnapshot(payload));
    expect(draftAgreement(s.draftHead, s.draft)).toBe("same");
    expect(s.draftHead.etag).toMatch(/^"draft:/);
    expect(s.reviews.items).toEqual([expect.objectContaining({ effectiveState: "SEALED", submittedByViewer: true, contentHash: hashSnapshot(payload) })]);
    expect(s.versions.items.map((item) => item.id)).toEqual([versionId]);
    expect(s.releaseHead.data?.currentReleaseId).toBe(releaseId);
    expect(s.releaseHead.etag).toMatch(/^"release:/);
    expect(s.releases.items).toEqual([expect.objectContaining({ id: releaseId, state: "PUBLISHED", intent: "PUBLISH" })]);
    expect(s.requests.items).toEqual([expect.objectContaining({ id: requestId, state: "CONSUMED", requestedByViewer: true, approvedByViewer: false })]);
    const serialized = JSON.stringify([o, s]);
    expect(serialized).not.toContain(owner.token);
    expect(serialized).not.toContain(reviewer.id);
    expect(sent.every((request) => request.method === "GET" && request.headers.get("cookie") === null)).toBe(true);

    const peer = consoleFor(reviewer).project();
    await peer.refresh();
    expect(peer.getSnapshot().reviews.items[0].submittedByViewer).toBe(false);
    expect(peer.getSnapshot().requests.items[0]).toMatchObject({ requestedByViewer: false, approvedByViewer: true });
  });

  it("keeps READ_DRAFT and READ_RELEASE independent in the console, in both directions", async () => {
    const draftOnly = await createActor(["READ_DRAFT"]), releaseOnly = await createActor(["READ_RELEASE"]);
    await member(draftOnly, ["VIEWER"]); await member(releaseOnly, ["VIEWER"]);

    const a = consoleFor(draftOnly).project();
    await a.refresh();
    let s = a.getSnapshot();
    expect(s.gate).toBeNull();
    expect([s.project, s.draftHead, s.draft, s.reviews, s.versions].map((slot) => slot.status)).toEqual(Array(5).fill("ready"));
    expect([s.releaseHead, s.releases, s.requests].map((slot) => slot.error?.code)).toEqual(["FORBIDDEN", "FORBIDDEN", "FORBIDDEN"]);
    expect(s.project.data?.effectiveActions.map((item) => item.action)).toEqual(["READ_DRAFT"]);

    const b = consoleFor(releaseOnly).project();
    await b.refresh();
    s = b.getSnapshot();
    expect([s.project, s.draftHead, s.versions].map((slot) => slot.error?.code)).toEqual(["FORBIDDEN", "FORBIDDEN", "FORBIDDEN"]);
    expect(s.releaseHead.data?.currentReleaseId).toBe(releaseId);
    expect(s.releases.items.map((item) => item.id)).toEqual([releaseId]);

    const list = consoleFor(releaseOnly).overview();
    await list.refresh();
    expect(list.getSnapshot()).toMatchObject({ gate: null, qualifications: { error: { code: "FORBIDDEN" } }, projects: { error: { code: "FORBIDDEN" } } });
  });

  it("shows nothing of a project to a qualified non-member", async () => {
    const outsider = await createActor();
    const store = consoleFor(outsider).project();
    await store.refresh();
    const s = store.getSnapshot();
    expect([s.project, s.draftHead, s.versions, s.releaseHead, s.releases, s.requests].map((slot) => slot.error?.code)).toEqual(Array(6).fill("NOT_FOUND"));
    expect([s.project.data, s.draftHead.data, s.draft.data, s.releaseHead.data]).toEqual([null, null, null, null]);
    const list = consoleFor(outsider).overview();
    await list.refresh();
    expect(list.getSnapshot().projects.items).toEqual([]);
  });

  it("drops everything after sign-out and after the HTTP flag is switched off, without fallback data", async () => {
    const leaving = await createActor(["READ_DRAFT", "READ_RELEASE"]);
    await member(leaving, ["VIEWER"]);
    const store = consoleFor(leaving).project();
    await store.refresh();
    expect(store.getSnapshot().draft.data?.contentHash).toBe(hashSnapshot(payload));
    expect((await leaving.client.auth.signOut()).error).toBeNull();
    await store.refresh();
    const s = store.getSnapshot();
    expect(s.gate?.code).toBe("AUTH_REQUIRED");
    expect(JSON.stringify(s)).not.toContain(hashSnapshot(payload));

    vi.stubEnv("REGISTRY_INTERNAL_READ_HTTP_ENABLED", "");
    try {
      const list = consoleFor(owner).overview();
      await list.refresh();
      expect(list.getSnapshot()).toMatchObject({ gate: { code: "DISABLED", status: 403 }, projects: { items: [] }, qualifications: { data: null } });
    } finally { vi.stubEnv("REGISTRY_INTERNAL_READ_HTTP_ENABLED", "true"); }
  });

  it("pages projects by exclusive cursor and refuses every write without a request or a change", async () => {
    const pager = await createActor(["READ_DRAFT", "READ_RELEASE"]);
    const own: string[] = [];
    for (let index = 0; index < 2; index++) {
      const extra = await db.project.create({ data: { slug: `console-page-${randomUUID()}`, ownerId: pager.id } });
      projects.push(extra.id); own.push(extra.id);
    }
    const wired = consoleFor(pager);
    const list = createOverviewStore(wired.adapter.client, { pageSize: 1 });
    await list.refresh();
    expect(list.getSnapshot().projects.items).toHaveLength(1);
    expect(list.getSnapshot().projects.nextCursor).not.toBeNull();
    await list.loadMore("projects");
    expect(list.getSnapshot().projects.items.map((item) => item.id).sort()).toEqual(own.sort());
    expect(list.getSnapshot().projects.nextCursor).toBeNull();

    const before = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    const requests = wired.sent.length;
    await expect(wired.adapter.execute({ action: "WITHDRAW_RELEASE", projectId, idempotencyKey: "withdraw_console", ifMatch: '"release:x:1"', input: { releaseId } }))
      .rejects.toMatchObject({ code: "READ_ONLY" });
    await expect(wired.adapter.replay(1)).rejects.toMatchObject({ code: "READ_ONLY" });
    expect(wired.sent.length).toBe(requests);
    const after = await db.project.findUniqueOrThrow({ where: { id: projectId } });
    expect({ revision: after.revision, currentReleaseId: after.currentReleaseId }).toEqual({ revision: before.revision, currentReleaseId: before.currentReleaseId });
  });
});
