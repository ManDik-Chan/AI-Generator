/*
 * The console's two Registry writes against a stateful fake server: request framing, idempotency,
 * ETag preconditions, conflicts, revocation, session loss, rate limits, the closed write switch and
 * uncertain outcomes. Real route handlers, JWTs and PostgreSQL: tests/integration/developer-console-registry-write.integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { createProjectResponseSchema as serverCreateResponse, editDraftResponseSchema as serverEditResponse } from "@/features/registry/write-contracts";
import { createRegistryReadClient } from "@/features/developer-console/registry/client";
import { createProjectCreateStore } from "@/features/developer-console/registry/create-store";
import { createDraftEditorStore, draftTemplate } from "@/features/developer-console/registry/draft-editor";
import { createRegistryWriteClient } from "@/features/developer-console/registry/write-client";
import {
  WRITE_ERROR_STATUS, createProjectResponseSchema, editDraftResponseSchema, payloadIssues, samePayload, stableStringify,
} from "@/features/developer-console/registry/write-contract";
import { registryWriteErrorStatuses } from "@/features/registry/write-contracts";
import { editAccess } from "@/features/developer-console/registry/write-view";
import { DRAFT, PROJECT, SLUG, TOKEN, fakeRegistry, validPayload } from "@/tests/fixtures/registry-console-write";

function setup(initial: Parameters<typeof fakeRegistry>[0] = {}, clock = { now: 1_000_000 }) {
  const server = fakeRegistry(initial);
  const now = () => clock.now;
  const getAccessToken = async () => TOKEN;
  const read = createRegistryReadClient({ fetch: server.fetch, getAccessToken, now });
  const write = createRegistryWriteClient({ fetch: server.fetch, getAccessToken, now });
  let saved = 0;
  const editor = createDraftEditorStore(read, write, PROJECT, { now, onSaved: () => { saved += 1; } });
  return { server, read, write, editor, clock, saved: () => saved };
}

const withSummary = (payload: ReturnType<typeof validPayload>, summary: string) => ({ ...payload, manifest: { ...payload.manifest, summary } });

describe("write client framing", () => {
  it("sends Bearer, a JSON body, the idempotency key and If-Match; never cookies, never Origin", async () => {
    const { server, write } = setup({ payload: validPayload() });
    const body = JSON.stringify(validPayload("1.0.0", "framed"));
    const outcome = await write.saveDraft({ projectId: PROJECT, key: "draft_k1", body, ifMatch: server.etag() });
    expect(outcome).toMatchObject({ kind: "ok", replayed: false, status: 200, etag: `"draft:${DRAFT}:2"` });
    const [call] = server.writes();
    expect(call).toMatchObject({ method: "PUT", path: `projects/${PROJECT}/draft`, body });
    expect(call.headers).toEqual({
      authorization: `Bearer ${TOKEN}`, accept: "application/json", "content-type": "application/json; charset=utf-8",
      "idempotency-key": "draft_k1", "if-match": `"draft:${DRAFT}:1"`,
    });
    expect(call.init).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
    expect(JSON.stringify(outcome)).not.toContain(TOKEN);
  });

  it("refuses to send without a session, with a malformed key, or a malformed If-Match", async () => {
    const server = fakeRegistry({ payload: validPayload() });
    const write = createRegistryWriteClient({ fetch: server.fetch, getAccessToken: async () => null });
    expect(await write.createProject({ key: "create_1", body: JSON.stringify({ slug: "abc-project" }) })).toEqual({ kind: "rejected", error: { code: "AUTH_REQUIRED", status: 0 } });
    const signed = createRegistryWriteClient({ fetch: server.fetch, getAccessToken: async () => TOKEN });
    expect(await signed.saveDraft({ projectId: PROJECT, key: "bad key!", body: "{}", ifMatch: server.etag() })).toMatchObject({ kind: "rejected", error: { code: "INVALID_INPUT", status: 0 } });
    expect(await signed.saveDraft({ projectId: PROJECT, key: "k", body: "{}", ifMatch: "W/\"weak\"" })).toMatchObject({ kind: "rejected", error: { status: 0 } });
    expect(await signed.createProject({ key: "k", body: JSON.stringify({ slug: "abc-project", ownerId: "x" }) })).toMatchObject({ kind: "rejected", error: { code: "INVALID_INPUT", status: 0 } });
    expect(server.writes()).toHaveLength(0);
  });

  it("treats lost responses, 503, and responses that do not match the request as unknown, never as success", async () => {
    const { server, write } = setup({ payload: validPayload() });
    const body = JSON.stringify(validPayload("1.0.0", "uncertain"));
    server.state.dropBeforeCommit = 1;
    expect(await write.saveDraft({ projectId: PROJECT, key: "k1", body, ifMatch: server.etag() })).toEqual({ kind: "unknown", reason: "NETWORK", status: 0 });
    server.state.unavailableNext = 1;
    expect(await write.saveDraft({ projectId: PROJECT, key: "k2", body, ifMatch: server.etag() })).toEqual({ kind: "unknown", reason: "UNAVAILABLE", status: 503 });

    const lying = createRegistryWriteClient({ getAccessToken: async () => TOKEN, fetch: async () => new Response(JSON.stringify({
      result: { id: DRAFT, projectId: PROJECT, revision: 2, state: "DRAFT", payload: validPayload("1.0.0", "something else") }, etag: `"draft:${DRAFT}:2"`, replayed: false,
    }), { status: 200 }) });
    expect(await lying.saveDraft({ projectId: PROJECT, key: "k3", body, ifMatch: server.etag() })).toMatchObject({ kind: "unknown", reason: "CONTRACT_MISMATCH" });
    const garbled = createRegistryWriteClient({ getAccessToken: async () => TOKEN, fetch: async () => new Response("<html>", { status: 502 }) });
    expect(await garbled.saveDraft({ projectId: PROJECT, key: "k4", body, ifMatch: server.etag() })).toMatchObject({ kind: "unknown", reason: "UNAVAILABLE" });
  });

  it("respects Retry-After and sends nothing until it has passed", async () => {
    const clock = { now: 1_000_000 };
    const { server, write } = setup({ payload: validPayload() }, clock);
    server.state.rateLimitNext = 1;
    const body = JSON.stringify(validPayload("1.0.0", "throttled"));
    expect(await write.saveDraft({ projectId: PROJECT, key: "k1", body, ifMatch: server.etag() })).toEqual({ kind: "rejected", error: { code: "RATE_LIMITED", status: 429, retryAt: 1_007_000 } });
    expect(await write.saveDraft({ projectId: PROJECT, key: "k2", body, ifMatch: server.etag() })).toMatchObject({ kind: "rejected", error: { code: "RATE_LIMITED", status: 0 } });
    expect(server.writes()).toHaveLength(1);
    clock.now = 1_007_001;
    expect((await write.saveDraft({ projectId: PROJECT, key: "k3", body, ifMatch: server.etag() })).kind).toBe("ok");
  });
});

describe("creating a project", () => {
  it("creates once, and an uncertain attempt is resent unchanged and resolves to the same project", async () => {
    const { server, write } = setup();
    let created = 0;
    const store = createProjectCreateStore(write, { onCreated: () => { created += 1; } });
    server.state.dropAfterCommit = 1;
    await store.submit("new-project");
    expect(store.getSnapshot()).toMatchObject({ phase: "unknown", unknownReason: "NETWORK", sends: 1 });
    expect(created).toBe(0);
    await store.submit("other-project"); // ignored while uncertain
    await store.retry();
    expect(store.getSnapshot()).toMatchObject({ phase: "created", created: { slug: "new-project", replayed: true } });
    const [first, second] = server.writes();
    expect(server.writes()).toHaveLength(2);
    expect(second.headers["idempotency-key"]).toBe(first.headers["idempotency-key"]);
    expect(second.body).toBe(first.body);
    expect(created).toBe(1);
  });

  it("a new submit after a settled result uses a new key; a taken slug is a conflict", async () => {
    const { server, write } = setup();
    const store = createProjectCreateStore(write);
    await store.submit("first-project");
    store.reset();
    await store.submit("first-project");
    expect(store.getSnapshot()).toMatchObject({ phase: "rejected", error: { code: "CONFLICT", status: 409 } });
    const keys = server.writes().map((call) => call.headers["idempotency-key"]);
    expect(new Set(keys).size).toBe(2);
  });

  it("FORBIDDEN and DISABLED close creation for the visit without further requests", async () => {
    for (const close of [(s: ReturnType<typeof fakeRegistry>) => { s.state.canCreate = false; }, (s: ReturnType<typeof fakeRegistry>) => { s.state.writesDisabled = true; }]) {
      const { server, write } = setup();
      close(server);
      const store = createProjectCreateStore(write);
      await store.submit("denied-project");
      expect(store.getSnapshot().denied?.code).toMatch(/FORBIDDEN|DISABLED/);
      await store.submit("denied-project");
      expect(server.writes()).toHaveLength(1);
    }
  });
});

describe("editing a draft", () => {
  it("first save of an uninitialized draft targets the head ETag; the template must be completed first", async () => {
    const { server, editor } = setup({ payload: null });
    await editor.load();
    const s = editor.getSnapshot();
    expect(s.base).toMatchObject({ etag: `"draft:${DRAFT}:1"`, payload: null });
    expect(s.working).toEqual(draftTemplate(PROJECT, SLUG));
    expect(s.dirty).toBe(false);
    await editor.save();
    expect(server.writes()).toHaveLength(0); // empty summary: nothing is sent
    editor.edit(withSummary(s.working!, "First content"));
    expect(editor.getSnapshot().dirty).toBe(true);
    await editor.save();
    expect(server.writes()[0].headers["if-match"]).toBe(`"draft:${DRAFT}:1"`);
    expect(editor.getSnapshot()).toMatchObject({ dirty: false, pending: null, base: { revision: 2, via: "save" }, last: { kind: "saved", revision: 2, replayed: false } });
  });

  it("each save is a new operation on the latest confirmed ETag; a second click while sending sends nothing", async () => {
    const { server, editor, saved } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Second"));
    await Promise.all([editor.save(), editor.save()]);
    editor.edit(withSummary(editor.getSnapshot().working!, "Third"));
    await editor.save();
    const writes = server.writes();
    expect(writes).toHaveLength(2);
    expect(writes.map((call) => call.headers["if-match"])).toEqual([`"draft:${DRAFT}:1"`, `"draft:${DRAFT}:2"`]);
    expect(writes[0].headers["idempotency-key"]).not.toBe(writes[1].headers["idempotency-key"]);
    expect(server.state.payload?.manifest.summary).toBe("Third");
    expect(saved()).toBe(2);
  });

  it("412: keeps the user's edits, shows the server version, and overwrites only after an explicit choice", async () => {
    const { server, editor } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Mine"));
    server.otherWriterSaves(validPayload("1.0.0", "Theirs"));
    await editor.save();
    let s = editor.getSnapshot();
    expect(s.last).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED", status: 412 } });
    expect(s.conflict).toMatchObject({ cause: "precondition", remote: { revision: 2 } });
    expect(s.working?.manifest.summary).toBe("Mine");
    await editor.save();
    expect(server.writes()).toHaveLength(1); // unresolved conflict blocks saving
    editor.resolveConflict("keep-mine");
    await editor.save();
    s = editor.getSnapshot();
    expect(server.writes()[1].headers["if-match"]).toBe(`"draft:${DRAFT}:2"`);
    expect(server.writes()[1].headers["idempotency-key"]).not.toBe(server.writes()[0].headers["idempotency-key"]);
    expect(server.state.payload?.manifest.summary).toBe("Mine");
    expect(s).toMatchObject({ dirty: false, conflict: null });
  });

  it("taking the server version replaces the working copy only on request", async () => {
    const { server, editor } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Mine"));
    server.otherWriterSaves(validPayload("1.0.0", "Theirs"));
    await editor.load();
    expect(editor.getSnapshot()).toMatchObject({ conflict: { cause: "changed-on-reload" }, working: { manifest: { summary: "Mine" } } });
    editor.resolveConflict("take-remote");
    expect(editor.getSnapshot()).toMatchObject({ conflict: null, dirty: false, base: { revision: 2 }, working: { manifest: { summary: "Theirs" } } });
  });

  it("revocation mid-session: 403 locks saving, keeps the edits, and the fresh project read drops EDIT_DRAFT", async () => {
    const { server, editor } = setup({ payload: validPayload() });
    await editor.load();
    expect(editAccess(editor.getSnapshot().project, null, "DRAFT", 0).kind).toBe("editable");
    editor.edit(withSummary(editor.getSnapshot().working!, "Unsaved when revoked"));
    server.state.editGrant = false;
    await editor.save();
    const s = editor.getSnapshot();
    expect(s.lock).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(s).toMatchObject({ dirty: true, working: { manifest: { summary: "Unsaved when revoked" } } });
    expect(editAccess(s.project, s.projectError, "DRAFT", 0)).toEqual({ kind: "no-grant" });
    await editor.save();
    expect(server.writes()).toHaveLength(1);
  });

  it("session loss: 401 keeps the edits; after signing in again a reload clears the lock and the save goes through", async () => {
    const { server, editor } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Across a sign-in"));
    server.state.session = false;
    await editor.save();
    expect(editor.getSnapshot()).toMatchObject({ lock: { code: "AUTH_REQUIRED", status: 401 }, dirty: true });
    server.state.session = true;
    await editor.load();
    expect(editor.getSnapshot().lock).toBeNull();
    await editor.save();
    expect(server.state.payload?.manifest.summary).toBe("Across a sign-in");
  });

  it("closed write switch is a real refusal: no success, no mock, edits kept", async () => {
    const { server, editor } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Switched off"));
    server.state.writesDisabled = true;
    await editor.save();
    expect(editor.getSnapshot()).toMatchObject({ lock: { code: "DISABLED" }, dirty: true, last: { kind: "rejected" } });
    expect(server.state.revision).toBe(1);
  });

  it("429 pauses saving until Retry-After", async () => {
    const clock = { now: 5_000_000 };
    const { server, editor } = setup({ payload: validPayload() }, clock);
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Later"));
    server.state.rateLimitNext = 1;
    await editor.save();
    expect(editor.getSnapshot().blockedUntil).toBe(5_007_000);
    await editor.save();
    expect(server.writes()).toHaveLength(1);
    clock.now = 5_007_001;
    await editor.save();
    expect(server.state.payload?.manifest.summary).toBe("Later");
  });

  it("unknown outcome after a commit: the verification read confirms it without a second write", async () => {
    const { server, editor } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Committed, response lost"));
    server.state.dropAfterCommit = 1;
    await editor.save();
    expect(editor.getSnapshot()).toMatchObject({ pending: null, dirty: false, base: { revision: 2, via: "verify" }, last: { kind: "saved", verified: true } });
    expect(server.writes()).toHaveLength(1);
  });

  it("unknown outcome before a commit stays unknown; retry resends the identical request", async () => {
    const { server, editor } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Never arrived"));
    server.state.dropBeforeCommit = 1;
    await editor.save();
    expect(editor.getSnapshot()).toMatchObject({ pending: { phase: "unknown", verification: "unchanged", reason: "NETWORK" }, dirty: true, last: null });
    // Editing while uncertain does not change what the retry sends.
    editor.edit(withSummary(editor.getSnapshot().working!, "Edited meanwhile"));
    await editor.save();
    await editor.retry();
    const [first, second] = server.writes();
    expect(server.writes()).toHaveLength(2);
    expect({ key: second.headers["idempotency-key"], ifMatch: second.headers["if-match"], body: second.body }).toEqual({ key: first.headers["idempotency-key"], ifMatch: first.headers["if-match"], body: first.body });
    expect(editor.getSnapshot()).toMatchObject({ pending: null, dirty: true, base: { revision: 2 }, working: { manifest: { summary: "Edited meanwhile" } } });
  });

  it("a retried attempt that had committed returns the replay, which is then checked against the latest head", async () => {
    const server = fakeRegistry({ payload: validPayload() });
    // Make the verification read fail so the attempt stays unknown, then retry.
    const realFetch = server.fetch;
    let failReads = 0;
    const read = createRegistryReadClient({ getAccessToken: async () => TOKEN, fetch: async (input, init) => {
      if ((init?.method ?? "GET") === "GET" && String(input).endsWith("/draft/head") && failReads-- > 0) throw new TypeError("offline");
      return realFetch(input, init);
    } });
    const write = createRegistryWriteClient({ fetch: server.fetch, getAccessToken: async () => TOKEN });
    const store = createDraftEditorStore(read, write, PROJECT);
    await store.load();
    store.edit(withSummary(store.getSnapshot().working!, "Replayed"));
    server.state.dropAfterCommit = 1;
    failReads = 1;
    await store.save();
    expect(store.getSnapshot().pending).toMatchObject({ phase: "unknown", verification: "unreadable" });
    await store.retry();
    expect(store.getSnapshot()).toMatchObject({ pending: null, last: { kind: "saved", replayed: true, verified: true }, base: { revision: 2 } });
    expect(server.writes()).toHaveLength(2);
    expect(server.state.revision).toBe(2); // the replay wrote nothing new
  });

  it("a reload never discards unsaved edits", async () => {
    const { editor } = setup({ payload: validPayload() });
    await editor.load();
    editor.edit(withSummary(editor.getSnapshot().working!, "Keep me"));
    await editor.load();
    expect(editor.getSnapshot()).toMatchObject({ dirty: true, conflict: null, working: { manifest: { summary: "Keep me" } } });
  });
});

describe("who may edit", () => {
  const project = (roles: string[], actions: string[], expiresAt = "2099-01-01T00:00:00.000Z") =>
    ({ id: PROJECT, slug: SLUG, visibility: "PRIVATE" as const, roles: roles as never, effectiveActions: actions.map((action) => ({ action: action as never, expiresAt })) });
  it("requires EDIT_DRAFT from the server; OWNER alone is not enough", () => {
    expect(editAccess(project(["OWNER"], ["READ_DRAFT"]), null, "DRAFT", 0)).toEqual({ kind: "no-grant" });
    expect(editAccess(project(["VIEWER"], ["READ_DRAFT"]), null, "DRAFT", 0)).toEqual({ kind: "no-role" });
    expect(editAccess(project(["EDITOR"], ["EDIT_DRAFT"]), null, "DRAFT", 0)).toMatchObject({ kind: "editable" });
    expect(editAccess(project(["OWNER"], ["EDIT_DRAFT"]), null, "IN_REVIEW", 0)).toEqual({ kind: "state", state: "IN_REVIEW" });
    expect(editAccess(project(["OWNER"], ["EDIT_DRAFT"], "2026-01-01T00:00:00.000Z"), null, "DRAFT", Date.parse("2026-06-01"))).toEqual({ kind: "no-grant" });
    expect(editAccess(null, { code: "NETWORK", status: 0 }, "DRAFT", 0)).toEqual({ kind: "unknown", error: { code: "NETWORK", status: 0 } });
  });
});

describe("payload checks and the browser mirror of the write contract", () => {
  type Def = { type: string; shape?: Record<string, z.ZodType>; catchall?: z.ZodType };
  const keys = (schema: z.ZodType) => Object.keys((schema as unknown as { def: Def }).def.shape!).sort();

  it("mirrors the server response envelopes and error statuses", () => {
    expect(keys(createProjectResponseSchema)).toEqual(keys(serverCreateResponse));
    expect(keys(editDraftResponseSchema)).toEqual(keys(serverEditResponse));
    expect(WRITE_ERROR_STATUS).toEqual(registryWriteErrorStatuses);
    const sample = { result: { id: DRAFT, projectId: PROJECT, revision: 2, state: "DRAFT", payload: validPayload() }, etag: `"draft:${DRAFT}:2"`, replayed: true };
    expect(editDraftResponseSchema.safeParse(sample).success).toBe(serverEditResponse.safeParse(sample).success);
    expect(editDraftResponseSchema.safeParse({ ...sample, extra: 1 }).success).toBe(false);
    const created = { result: { id: PROJECT, slug: "abc-project" }, replayed: false };
    expect(createProjectResponseSchema.safeParse(created).success).toBe(serverCreateResponse.safeParse(created).success);
  });

  it("checks the binding rules the server enforces before anything is sent", () => {
    expect(payloadIssues(validPayload(), { projectId: PROJECT, slug: SLUG })).toEqual([]);
    const mismatch = validPayload();
    mismatch.presentation.version = "9.9.9";
    expect(payloadIssues(mismatch, { projectId: PROJECT, slug: SLUG }).join()).toContain("presentation.version");
    expect(payloadIssues(validPayload(), { projectId: PROJECT, slug: "another-slug" }).join()).toContain("manifest.slug");
    expect(payloadIssues({ manifest: {} }).length).toBeGreaterThan(0);
    expect(samePayload({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
