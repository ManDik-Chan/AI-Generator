/*
 * P1-F2 acceptance: the developer console's browser write client and stores against the real
 * exported route handlers (app/api/internal/registry/[[...path]]/route.ts), real Supabase Auth
 * sessions and the isolated PostgreSQL database. Only fetch is substituted: it calls the route in
 * process and adds the Origin and fetch-metadata headers a browser sends with a same-origin write.
 * Next ingress and reverse-proxy behaviour are not exercised here.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

import { createRegistryReadAdapter } from "@/features/developer-console/registry/adapter";
import { createRegistryWriteAdapter } from "@/features/developer-console/registry/write-adapter";
import { editAccess } from "@/features/developer-console/registry/write-view";
import { hashSnapshot } from "@/features/registry/canonical";
import { editRegistryDraft, getRegistryDraft } from "@/features/registry/protocol";
import { REGISTRY_ACTION_ROLES } from "@/features/registry/read-contracts";
import { assertDisposableTarget } from "../../scripts/disposable-supabase.mjs";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real console-write Auth/database environment required");
if (enabled && ![process.env.TEST_DATABASE_URL!, process.env.SUPABASE_TEST_URL!]
  .every((value) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname))) {
  throw new Error("Console write acceptance requires loopback-only disposable endpoints");
}

type Actor = { id: string; token: string; client: SupabaseClient };
const actions = Object.keys(REGISTRY_ACTION_ROLES);
const tables = ["projects", "project_drafts", "project_versions", "project_releases", "project_assets", "project_documentation", "project_memberships", "publication_reviews"];
const ORIGIN = "http://127.0.0.1:3000";
const FLAGS = ["REGISTRY_INTERNAL_ACCESS_ENABLED", "REGISTRY_INTERNAL_READ_ENABLED", "REGISTRY_INTERNAL_READ_HTTP_ENABLED", "REGISTRY_INTERNAL_WRITE_HTTP_ENABLED", "REGISTRY_DRAFT_REVIEW_ENABLED"];

describe.skipIf(!enabled)("Developer console Registry writes with real Auth sessions and isolated PostgreSQL", () => {
  let db: PrismaClient, service: SupabaseClient;
  let route: typeof import("@/app/api/internal/registry/[[...path]]/route");
  const actors: Actor[] = [], projects: string[] = [];
  const anon = (key = process.env.SUPABASE_TEST_ANON_KEY!) => createClient(process.env.SUPABASE_TEST_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  /**
   * The console as the browser builds it. `lose` makes the next write commit on the server and then
   * fail on the client, like a connection dropped after the request was processed.
   */
  function consoleFor(actor: Actor) {
    const sent: { method: string; path: string; key: string | null; ifMatch: string | null; body: string | null }[] = [];
    let lose = 0;
    const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), ORIGIN);
      const method = (init.method ?? "GET") as "GET" | "POST" | "PUT";
      const headers = new Headers(init.headers);
      expect(init).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error" });
      expect(headers.has("origin")).toBe(false); // browsers add Origin themselves; the client never sets it
      headers.set("Origin", ORIGIN);
      headers.set("Sec-Fetch-Site", "same-origin");
      const body = typeof init.body === "string" ? init.body : null;
      sent.push({ method, path: url.pathname, key: headers.get("idempotency-key"), ifMatch: headers.get("if-match"), body });
      const request = new Request(url, { method, headers, ...(body === null ? {} : { body }) });
      const path = url.pathname.replace(/^\/api\/internal\/registry\/?/, "").split("/").filter(Boolean);
      const response = await route[method](request, { params: Promise.resolve({ path }) });
      if (method !== "GET" && lose > 0) { lose -= 1; await response.text(); throw new TypeError("connection lost after commit"); }
      return response;
    };
    const options = { fetch: fetch as typeof globalThis.fetch, getAccessToken: async () => actor.token };
    const read = createRegistryReadAdapter(options);
    const write = createRegistryWriteAdapter(read, options);
    return { read, write, sent, writes: () => sent.filter((call) => call.method !== "GET"), loseNext: () => { lose += 1; } };
  }

  async function createActor(granted: string[] = actions, canCreate = true): Promise<Actor> {
    const email = `console-write-${randomUUID()}@example.test`, password = `Aa!${randomUUID()}z9`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(made.error).toBeNull();
    const signed = anon(), login = await signed.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const actor = { id: made.data.user!.id, token: login.data.session!.access_token, client: signed };
    actors.push(actor);
    await db.$executeRaw`INSERT INTO registry_private.internal_operators(subject_id,active,can_create,expires_at)
      VALUES(${actor.id}::uuid,true,${canCreate},clock_timestamp()+interval '1 hour')`;
    for (const action of granted) await db.$executeRaw`INSERT INTO registry_private.operator_actions(subject_id,action,active,expires_at)
      VALUES(${actor.id}::uuid,${action},true,clock_timestamp()+interval '1 hour')`;
    return actor;
  }

  /** Creates a project through the console's create store and records it for cleanup. */
  async function createThroughConsole(console: ReturnType<typeof consoleFor>) {
    const slug = `cw-${randomUUID().slice(0, 8)}`;
    const creator = console.write.creator();
    creator.reset();
    await creator.submit(slug);
    const created = creator.getSnapshot().created;
    expect(creator.getSnapshot()).toMatchObject({ phase: "created", created: { slug, replayed: false } });
    projects.push(created!.id);
    return created!;
  }

  beforeAll(async () => {
    assertDisposableTarget();
    db = createIntegrationPrisma(); service = anon(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.SUPABASE_TEST_URL!);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.SUPABASE_TEST_ANON_KEY!);
    for (const flag of FLAGS) vi.stubEnv(flag, "true");
    route = await import("@/app/api/internal/registry/[[...path]]/route");
  }, 60000);

  afterAll(async () => {
    vi.unstubAllEnvs(); if (!db) return;
    try {
      // Only guarded disposable fixtures are removed; no production endpoint is accepted.
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role='replica'");
        for (const table of ["project_creation_receipts", "command_receipts", "review_invalidations"]) {
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

  it("creates a project, replays an uncertain create, saves the first and second draft, and reads back the server's hash", async () => {
    const owner = await createActor();
    const console = consoleFor(owner);

    // Uncertain create: committed on the server, response lost. The identical retry replays it.
    const slug = `cw-${randomUUID().slice(0, 8)}`;
    const creator = console.write.creator();
    console.loseNext();
    await creator.submit(slug);
    expect(creator.getSnapshot()).toMatchObject({ phase: "unknown", unknownReason: "NETWORK" });
    const stored = await db.project.findUnique({ where: { slug } });
    expect(stored?.ownerId).toBe(owner.id);
    projects.push(stored!.id);
    await creator.retry();
    expect(creator.getSnapshot()).toMatchObject({ phase: "created", created: { id: stored!.id, slug, replayed: true } });
    const [first, second] = console.writes();
    expect(second).toEqual(first);
    expect(await db.project.count({ where: { slug } })).toBe(1);
    expect(await db.projectMembership.findFirst({ where: { projectId: stored!.id, subjectId: owner.id } })).toMatchObject({ roles: ["OWNER"] });

    // First save of the empty draft uses the head ETag.
    const editor = console.write.editor(stored!.id);
    await editor.load();
    let s = editor.getSnapshot();
    expect(s.base).toMatchObject({ payload: null, revision: 1 });
    expect(editAccess(s.project, s.projectError, s.base!.state, Date.now())).toMatchObject({ kind: "editable" });
    const headEtag = s.base!.etag;
    editor.edit({ ...s.working!, manifest: { ...s.working!.manifest, summary: "First content from the console" } });
    await editor.save();
    s = editor.getSnapshot();
    expect(s).toMatchObject({ dirty: false, pending: null, last: { kind: "saved", revision: 2, replayed: false }, base: { revision: 2 } });
    expect(console.writes().at(-1)).toMatchObject({ method: "PUT", ifMatch: headEtag });

    // Second save: a new operation on the ETag the save returned.
    const saveEtag = s.base!.etag;
    editor.edit({ ...s.working!, presentation: { ...s.working!.presentation, title: "Second save" } });
    await editor.save();
    const keys = console.writes().filter((call) => call.method === "PUT").map((call) => call.key);
    expect(new Set(keys).size).toBe(2);
    expect(console.writes().at(-1)?.ifMatch).toBe(saveEtag);
    await editor.load();
    s = editor.getSnapshot();
    const server = await getRegistryDraft({ accessToken: owner.token, projectId: stored!.id });
    expect(s.base).toMatchObject({ revision: 3, contentHash: server.contentHash, etag: server.etag });
    expect(server.contentHash).toBe(hashSnapshot(s.working!));
    expect(s.dirty).toBe(false);
  }, 120000);

  it("412 from a concurrent writer opens a conflict; the user's edits survive and are saved only after an explicit choice", async () => {
    const owner = await createActor();
    const console = consoleFor(owner);
    const { id } = await createThroughConsole(console);
    const editor = console.write.editor(id);
    await editor.load();
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "Base content" } });
    await editor.save();
    const base = editor.getSnapshot();
    editor.edit({ ...base.working!, manifest: { ...base.working!.manifest, summary: "Mine" } });

    // Another session of the same operator saves first.
    const theirs = { ...base.base!.payload!, manifest: { ...base.base!.payload!.manifest, summary: "Theirs" } };
    await editRegistryDraft({ accessToken: owner.token, projectId: id, ifMatch: base.base!.etag, idempotencyKey: randomUUID(), input: theirs });

    await editor.save();
    let s = editor.getSnapshot();
    expect(s.last).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED", status: 412 } });
    expect(s.conflict?.remote?.payload?.manifest.summary).toBe("Theirs");
    expect(s.working?.manifest.summary).toBe("Mine");
    editor.resolveConflict("keep-mine");
    await editor.save();
    s = editor.getSnapshot();
    expect(s).toMatchObject({ conflict: null, dirty: false, last: { kind: "saved" } });
    expect((await getRegistryDraft({ accessToken: owner.token, projectId: id })).result.payload.manifest.summary).toBe("Mine");
  }, 120000);

  it("an uncertain save that committed is confirmed by reading back, without a second write", async () => {
    const owner = await createActor();
    const console = consoleFor(owner);
    const { id } = await createThroughConsole(console);
    const editor = console.write.editor(id);
    await editor.load();
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "Committed, response lost" } });
    console.loseNext();
    await editor.save();
    expect(editor.getSnapshot()).toMatchObject({ pending: null, dirty: false, last: { kind: "saved", verified: true }, base: { via: "verify", revision: 2 } });
    expect(console.writes().filter((call) => call.method === "PUT")).toHaveLength(1);
  }, 120000);

  it("OWNER without EDIT_DRAFT can create and read but not save; revoking EDIT_DRAFT mid-session locks saving and keeps the edits", async () => {
    const ownerOnly = await createActor(actions.filter((action) => action !== "EDIT_DRAFT"));
    const restricted = consoleFor(ownerOnly);
    const { id } = await createThroughConsole(restricted);
    const blocked = restricted.write.editor(id);
    await blocked.load();
    let s = blocked.getSnapshot();
    expect(s.project?.roles).toEqual(["OWNER"]);
    expect(editAccess(s.project, s.projectError, s.base!.state, Date.now())).toEqual({ kind: "no-grant" });

    const editorActor = await createActor();
    const console = consoleFor(editorActor);
    const created = await createThroughConsole(console);
    const editor = console.write.editor(created.id);
    await editor.load();
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "Before revocation" } });
    await editor.save();
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "Unsaved at revocation" } });
    await db.$executeRaw`UPDATE registry_private.operator_actions SET active=false WHERE subject_id=${editorActor.id}::uuid AND action='EDIT_DRAFT'`;
    await editor.save();
    s = editor.getSnapshot();
    expect(s.lock).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(s).toMatchObject({ dirty: true, working: { manifest: { summary: "Unsaved at revocation" } } });
    expect(editAccess(s.project, s.projectError, "DRAFT", Date.now())).toEqual({ kind: "no-grant" });
    expect((await getRegistryDraft({ accessToken: editorActor.token, projectId: created.id })).result.payload.manifest.summary).toBe("Before revocation");
  }, 120000);

  it("without can_create the server refuses creation and nothing is stored", async () => {
    const actor = await createActor(actions, false);
    const console = consoleFor(actor);
    const creator = console.write.creator();
    const slug = `cw-${randomUUID().slice(0, 8)}`;
    await creator.submit(slug);
    expect(creator.getSnapshot()).toMatchObject({ phase: "rejected", denied: { code: "FORBIDDEN", status: 403 } });
    expect(await db.project.findUnique({ where: { slug } })).toBeNull();
  }, 60000);

  it("a closed write switch and a signed-out session are real refusals that keep the edits", async () => {
    const owner = await createActor();
    const console = consoleFor(owner);
    const { id } = await createThroughConsole(console);
    const editor = console.write.editor(id);
    await editor.load();
    editor.edit({ ...editor.getSnapshot().working!, manifest: { ...editor.getSnapshot().working!.manifest, summary: "Not while switched off" } });
    vi.stubEnv("REGISTRY_INTERNAL_WRITE_HTTP_ENABLED", "false");
    try {
      await editor.save();
      expect(editor.getSnapshot()).toMatchObject({ lock: { code: "DISABLED", status: 403 }, dirty: true, base: { revision: 1 } });
    } finally { vi.stubEnv("REGISTRY_INTERNAL_WRITE_HTTP_ENABLED", "true"); }
    await editor.load();
    expect(editor.getSnapshot().lock).toBeNull();

    expect((await owner.client.auth.signOut()).error).toBeNull();
    await editor.save();
    expect(editor.getSnapshot()).toMatchObject({ lock: { code: "AUTH_REQUIRED", status: 401 }, dirty: true });
    const draft = await db.projectDraft.findFirst({ where: { projectId: id } });
    expect(draft?.revision).toBe(1); // neither refusal wrote anything
  }, 120000);
});
