import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import { registryFunctions } from "@/features/developer-console/api-catalog";
import { commandFunction, type AssetAction, type CommandResult, type ConsoleAction, type ConsoleCommand, type DraftPayload } from "@/features/developer-console/model";
import { ACTION_ROLES, actionMeta, ASSET_ROLES, DRAFT_ROLES, RELEASE_ROLES } from "@/features/developer-console/permissions";
import { execute, isReleaseAction, projectSummaries, projectView, REVIEW_TTL_MS, toggleQualification, type MockState } from "@/features/developer-console/mock/engine";
import { SEED_EPOCH, createSeedState, initialPayloadFor, projectIdFor } from "@/features/developer-console/mock/seed";
import { draftDTOSchema, draftPayloadSchema, validateDraftPayload, versionDTOSchema } from "@/features/registry/contracts";

const T = SEED_EPOCH;
let key = 0;
const k = () => `test_${++key}`;

type Command = ConsoleCommand;
function step(state: MockState, persona: string, command: Command, now = T) {
  return execute(state, persona, command, now);
}
const ok = (result: CommandResult) => {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}`);
  return result.response;
};
const err = (result: CommandResult) => (result.ok ? "OK" : `${result.error.code} ${result.error.status}`);
const view = (state: MockState, slug: string, persona = "you", now = T) => projectView(state, slug, persona, now)!;

const sorting = projectIdFor("sorting-lab");
const air = projectIdFor("air-quality");
const volume = projectIdFor("volume-reconstruction");
const notes = projectIdFor("research-notes");

function edited(state: MockState, slug: string, change: (payload: DraftPayload) => void) {
  const payload = structuredClone(view(state, slug).draft.dto!.payload);
  change(payload);
  return payload;
}

describe("seed data satisfies the merged Registry contracts", () => {
  const state = createSeedState();
  it.each(state.projects.map((project) => [project.slug, project]))("%s", (_slug, project) => {
    for (const version of project.versions) expect(versionDTOSchema.parse(version)).toBeTruthy(); // recomputes the JCS hash
    for (const draft of project.drafts) {
      if (!draft.payload) continue;
      expect(validateDraftPayload(draft.payload, { projectId: project.id, slug: project.slug })).toBeTruthy();
      expect(draftDTOSchema.parse({ id: draft.id, projectId: project.id, revision: draft.revision, state: draft.state, payload: draft.payload })).toBeTruthy();
    }
  });

  it("starts each project at a different stage", () => {
    const summaries = projectSummaries(state, "you", T);
    expect(summaries.map((summary) => [summary.slug, summary.draftState, summary.currentRelease])).toEqual([
      ["sorting-lab", "DRAFT", "1.0.0"],
      ["air-quality", "IN_REVIEW", "0.1.0"],
      ["volume-reconstruction", "PUBLISHED", "0.3.0"],
      ["research-notes", "DRAFT", null],
    ]);
    expect(summaries.find((summary) => summary.slug === "air-quality")?.pendingReview).toBe(true);
    expect(view(state, "research-notes").draft.dto).toBeNull();
    expect(view(state, "research-notes").visibility).toBe("PRIVATE");
  });

  it("the initial payload for an empty draft is valid", () => {
    expect(draftPayloadSchema.parse(initialPayloadFor("research-notes", "研究笔记工作区"))).toBeTruthy();
  });
});

describe("full pipeline: Draft → Review → Version → Release", () => {
  it("runs end to end with independent actors and advances revisions like the B1 triggers", () => {
    let state = createSeedState();
    let v = view(state, "sorting-lab");
    expect(v.draft.head.revision).toBe(2);

    // Edit (CAS) → revision 3
    let r = step(state, "you", { action: "EDIT_DRAFT", projectId: sorting, ifMatch: v.draft.etag, idempotencyKey: k(), input: edited(state, "sorting-lab", (p) => { p.manifest.summary = "新的简介"; }) });
    state = r.state;
    expect(ok(r.result).etag).toBe(`"draft:${v.draft.head.id}:3"`);

    // Submit → IN_REVIEW, revision 4, review bound to revision 4
    v = view(state, "sorting-lab");
    r = step(state, "you", { action: "SUBMIT_REVIEW", projectId: sorting, ifMatch: v.draft.etag, idempotencyKey: k(), input: { expectedContentHash: v.draft.contentHash! } });
    state = r.state;
    v = view(state, "sorting-lab");
    expect(v.draft.head).toMatchObject({ state: "IN_REVIEW", revision: 4 });
    const review = v.reviews[0];
    expect(review).toMatchObject({ decision: "PENDING", effectiveState: "PENDING", draftRevision: 4, submittedByViewer: true });

    // The submitter cannot review their own submission.
    r = step(state, "you", { action: "DECIDE_REVIEW", projectId: sorting, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: review.id, decision: "APPROVED", expectedContentHash: review.contentHash } });
    expect(err(r.result)).toBe("NOT_FOUND 404"); // "you" has no REVIEWER role at all
    state = r.state;

    r = step(state, "reviewer", { action: "DECIDE_REVIEW", projectId: sorting, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: review.id, decision: "APPROVED", expectedContentHash: review.contentHash } });
    state = r.state;
    expect(ok(r.result).etag).toBe(v.draft.etag); // a decision does not touch the draft

    // Seal → Version 1.1.0, draft frozen
    v = view(state, "sorting-lab");
    r = step(state, "you", { action: "SEAL_VERSION", projectId: sorting, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: review.id, expectedContentHash: review.contentHash } });
    state = r.state;
    const version = versionDTOSchema.parse(ok(r.result).result);
    expect(version.version).toBe("1.1.0");
    v = view(state, "sorting-lab");
    expect(v.draft.head.state).toBe("PUBLISHED");
    expect(v.reviews[0].effectiveState).toBe("SEALED");
    expect(v.currentReleaseId).not.toBeNull(); // sealing does not change the release pointer

    // Release: request → independent approval → publish by the requester
    const head = v.releaseETag;
    r = step(state, "you", { action: "REQUEST_RELEASE", projectId: sorting, ifMatch: head, idempotencyKey: k(), input: { versionId: version.id, expectedContentHash: version.contentHash, intent: "PUBLISH" } });
    state = r.state;
    const request = ok(r.result).result as { id: string };
    expect(ok(r.result).etag).toBe(head); // a request does not move the release head
    // Command results have the shape of release.ts Response.result.
    expect(ok(r.result).result).toEqual({ id: request.id, projectId: sorting, versionId: version.id, state: "PENDING" });

    r = step(state, "you", { action: "APPROVE_RELEASE", projectId: sorting, ifMatch: head, idempotencyKey: k(), input: { requestId: request.id } });
    expect(err(r.result)).toBe("NOT_FOUND 404");
    r = step(state, "reviewer", { action: "APPROVE_RELEASE", projectId: sorting, ifMatch: head, idempotencyKey: k(), input: { requestId: request.id } });
    state = r.state;
    const approvalId = (ok(r.result).result as { id: string }).id;
    expect(ok(r.result).result).toEqual({ id: approvalId, projectId: sorting, versionId: version.id, state: "APPROVED" });

    r = step(state, "coauthor", { action: "PUBLISH_RELEASE", projectId: sorting, ifMatch: head, idempotencyKey: k(), input: { approvalId } });
    expect(err(r.result)).toBe("NOT_FOUND 404"); // EDITOR cannot publish
    r = step(state, "you", { action: "PUBLISH_RELEASE", projectId: sorting, ifMatch: head, idempotencyKey: k(), input: { approvalId } });
    state = r.state;
    v = view(state, "sorting-lab");
    expect(ok(r.result).result).toEqual({ id: v.releases[0].id, projectId: sorting, versionId: version.id, state: "PUBLISHED" });
    expect(v.releases[0]).toMatchObject({ version: "1.1.0", state: "PUBLISHED" });
    expect(v.currentReleaseId).toBe(v.releases[0].id);
    expect(v.releaseETag).not.toBe(head);
    expect(v.releases.filter((release) => release.state === "PUBLISHED").map((release) => release.version)).toEqual(["1.1.0", "1.0.0"]);
  });
});

describe("preconditions, CAS and idempotency", () => {
  const base = () => createSeedState();
  const editCommand = (state: MockState, ifMatch: string | undefined, idempotencyKey = k()): Command => ({
    action: "EDIT_DRAFT", projectId: sorting, ifMatch, idempotencyKey, input: edited(state, "sorting-lab", (p) => { p.manifest.name = "改名"; }),
  });

  it("rejects missing, malformed and stale ETags", () => {
    const state = base();
    expect(err(step(state, "you", editCommand(state, undefined)).result)).toBe("PRECONDITION_REQUIRED 428");
    expect(err(step(state, "you", editCommand(state, "W/\"draft:x:1\"")).result)).toBe("INVALID_INPUT 422");
    const stale = view(state, "sorting-lab").draft.etag.replace(/:2"$/, ':1"');
    expect(err(step(state, "you", editCommand(state, stale)).result)).toBe("PRECONDITION_FAILED 412");
  });

  it("returns the original state object on failure (rollback)", () => {
    const state = base();
    const { state: after } = step(state, "you", editCommand(state, undefined));
    expect(after).toBe(state);
  });

  it("replays the same request without a second effect and rejects key reuse with a different body", () => {
    let state = base();
    const command = editCommand(state, view(state, "sorting-lab").draft.etag, "same_key");
    const first = step(state, "you", command);
    state = first.state;
    const again = step(state, "you", command);
    expect(ok(again.result).replayed).toBe(true);
    expect(ok(again.result).etag).toBe(ok(first.result).etag);
    expect(view(again.state, "sorting-lab").draft.head.revision).toBe(3);
    const different = { ...command, input: edited(state, "sorting-lab", (p) => { p.manifest.name = "另一个名字"; }) } as Command;
    expect(err(step(state, "you", different).result)).toBe("IDEMPOTENCY_CONFLICT 409");
    // Keys are scoped per actor: the same key from another member is a new request.
    const peer = step(state, "coauthor", { ...command, ifMatch: view(state, "sorting-lab").draft.etag } as Command);
    expect(ok(peer.result).replayed).toBe(false);
  });

  it("a concurrent edit makes the other tab's ETag stale", () => {
    let state = base();
    const mine = view(state, "sorting-lab").draft.etag;
    state = step(state, "coauthor", editCommand(state, mine)).state;
    expect(err(step(state, "you", editCommand(state, mine)).result)).toBe("PRECONDITION_FAILED 412");
  });
});

describe("roles, independence and freshness", () => {
  it("hides projects from members without the action's role", () => {
    const state = createSeedState();
    const etag = view(state, "sorting-lab").draft.etag;
    const input = edited(state, "sorting-lab", () => {});
    expect(err(step(state, "guest", { action: "EDIT_DRAFT", projectId: sorting, ifMatch: etag, idempotencyKey: k(), input }).result)).toBe("NOT_FOUND 404");
    expect(err(step(state, "reviewer", { action: "EDIT_DRAFT", projectId: sorting, ifMatch: etag, idempotencyKey: k(), input }).result)).toBe("NOT_FOUND 404");
    expect(err(step(state, "nobody", { action: "EDIT_DRAFT", projectId: sorting, ifMatch: etag, idempotencyKey: k(), input }).result)).toBe("AUTH_REQUIRED 401");
  });

  it("rejects self-review with FORBIDDEN even when the submitter also holds REVIEWER", () => {
    let state = createSeedState();
    state.projects.find((project) => project.id === air)!.members.you = ["OWNER", "EDITOR", "REVIEWER"];
    const v = view(state, "air-quality");
    const review = v.reviews[0];
    const r = step(state, "you", { action: "DECIDE_REVIEW", projectId: air, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: review.id, decision: "APPROVED", expectedContentHash: review.contentHash } });
    expect(err(r.result)).toBe("FORBIDDEN 403");
    state = r.state;
  });

  it("expires reviews after 15 minutes of mock time", () => {
    const state = createSeedState();
    const v = view(state, "air-quality");
    const review = v.reviews[0];
    const late = T + REVIEW_TTL_MS;
    expect(view(state, "air-quality", "you", late).reviews[0].effectiveState).toBe("INVALIDATED");
    const r = step(state, "reviewer", { action: "DECIDE_REVIEW", projectId: air, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: review.id, decision: "APPROVED", expectedContentHash: review.contentHash } }, late);
    expect(err(r.result)).toBe("REVIEW_INVALID 409");
  });

  it("revoking a qualification is immediate and restoring it does not revive the old review", () => {
    let state = toggleQualification(createSeedState(), "reviewer");
    const v = view(state, "air-quality");
    const review = v.reviews[0];
    const decide = (s: MockState) => step(s, "reviewer", { action: "DECIDE_REVIEW", projectId: air, ifMatch: view(s, "air-quality").draft.etag, idempotencyKey: k(), input: { reviewId: review.id, decision: "APPROVED", expectedContentHash: review.contentHash } });
    expect(err(decide(state).result)).toBe("FORBIDDEN 403");
    state = toggleQualification(state, "reviewer");
    expect(err(decide(state).result)).toBe("REVIEW_INVALID 409"); // epoch moved twice
  });

  it("withdrawing a review invalidates it and reopens the draft; editing in review is a conflict", () => {
    let state = createSeedState();
    let v = view(state, "air-quality");
    const payload = structuredClone(v.draft.dto!.payload);
    expect(err(step(state, "you", { action: "EDIT_DRAFT", projectId: air, ifMatch: v.draft.etag, idempotencyKey: k(), input: payload }).result)).toBe("CONFLICT 409");
    const r = step(state, "you", { action: "WITHDRAW_REVIEW", projectId: air, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: v.reviews[0].id } });
    expect((ok(r.result).result as { effectiveState: string }).effectiveState).toBe("INVALIDATED");
    state = r.state;
    v = view(state, "air-quality");
    expect(v.draft.head).toMatchObject({ state: "DRAFT", revision: 4 });
    expect(v.reviews[0].effectiveState).toBe("INVALIDATED");
  });

  it("an uninitialized B1 draft cannot be submitted until its first valid edit", () => {
    let state = createSeedState();
    let v = view(state, "research-notes");
    expect(err(step(state, "you", { action: "SUBMIT_REVIEW", projectId: notes, ifMatch: v.draft.etag, idempotencyKey: k(), input: { expectedContentHash: "0".repeat(64) } }).result)).toBe("DRAFT_UNINITIALIZED 409");
    state = step(state, "you", { action: "EDIT_DRAFT", projectId: notes, ifMatch: v.draft.etag, idempotencyKey: k(), input: initialPayloadFor("research-notes", "研究笔记工作区") }).state;
    v = view(state, "research-notes");
    expect(v.draft.dto?.payload.manifest.version).toBe("0.0.1");
  });

  it("rejects payloads that belong to another project", () => {
    const state = createSeedState();
    const v = view(state, "research-notes");
    const r = step(state, "you", { action: "EDIT_DRAFT", projectId: notes, ifMatch: v.draft.etag, idempotencyKey: k(), input: initialPayloadFor("sorting-lab", "x") });
    expect(err(r.result)).toBe("INVALID_INPUT 422");
  });
});

/** Request (you) → independent approval (reviewer) on one project; returns ids and the new state. */
function approvedRequest(state: MockState, slug: string, versionLabel: string, intent: "PUBLISH" | "ROLLBACK" = "PUBLISH", now = T) {
  const v = view(state, slug, "you", now);
  const version = v.versions.find((item) => item.version === versionLabel)!;
  const target = intent === "ROLLBACK" ? v.releases.find((release) => release.versionId === version.id && release.id !== v.currentReleaseId)!.id : undefined;
  let r = step(state, "you", { action: "REQUEST_RELEASE", projectId: v.id, ifMatch: v.releaseETag, idempotencyKey: k(), input: { versionId: version.id, expectedContentHash: version.contentHash, intent, ...(target ? { targetReleaseId: target } : {}) } }, now);
  const requestId = (ok(r.result).result as { id: string }).id;
  r = step(r.state, "reviewer", { action: "APPROVE_RELEASE", projectId: v.id, ifMatch: v.releaseETag, idempotencyKey: k(), input: { requestId } }, now);
  return { state: r.state, requestId, approvalId: (ok(r.result).result as { id: string }).id, head: v.releaseETag, versionId: version.id };
}

describe("release history (merged B2-B semantics)", () => {
  it("withdrawing the current release clears the pointer and makes the project private", () => {
    const state = createSeedState();
    const v = view(state, "sorting-lab");
    const r = step(state, "you", { action: "WITHDRAW_RELEASE", projectId: sorting, ifMatch: v.releaseETag, idempotencyKey: k(), input: { releaseId: v.currentReleaseId! } });
    const after = view(r.state, "sorting-lab");
    expect(after).toMatchObject({ currentReleaseId: null, visibility: "PRIVATE", authzEpoch: v.authzEpoch + 1, revision: v.revision + 1 });
    expect(err(step(r.state, "you", { action: "WITHDRAW_RELEASE", projectId: sorting, ifMatch: after.releaseETag, idempotencyKey: k(), input: { releaseId: v.currentReleaseId! } }).result)).toBe("CONFLICT 409");
  });

  it("rolls back by creating a new release from an older version, never by reviving the old one", () => {
    let state = createSeedState();
    let v = view(state, "volume-reconstruction");
    const older = v.releases.find((release) => release.version === "0.2.0")!;
    const version = v.versions.find((item) => item.id === older.versionId)!;
    let r = step(state, "you", { action: "REQUEST_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { versionId: version.id, expectedContentHash: version.contentHash, intent: "ROLLBACK", targetReleaseId: older.id } });
    state = r.state;
    const requestId = (ok(r.result).result as { id: string }).id;
    r = step(state, "reviewer", { action: "APPROVE_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { requestId } });
    state = r.state;
    const approvalId = (ok(r.result).result as { id: string }).id;
    // A PUBLISH command cannot consume a ROLLBACK approval.
    expect(err(step(state, "you", { action: "PUBLISH_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { approvalId } }).result)).toBe("APPROVAL_INVALID 409");
    r = step(state, "you", { action: "ROLLBACK_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { approvalId } });
    state = r.state;
    v = view(state, "volume-reconstruction");
    expect(v.releases[0]).toMatchObject({ version: "0.2.0", intent: "ROLLBACK", state: "PUBLISHED" });
    expect(v.releases[0].id).not.toBe(older.id);
    expect(v.currentReleaseId).toBe(v.releases[0].id);
  });

  it("an approval goes stale when the release head moves", () => {
    let state = createSeedState();
    const v = view(state, "volume-reconstruction");
    const older = v.releases.find((release) => release.version === "0.2.0")!;
    const version = v.versions.find((item) => item.id === older.versionId)!;
    let r = step(state, "you", { action: "REQUEST_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { versionId: version.id, expectedContentHash: version.contentHash, intent: "ROLLBACK", targetReleaseId: older.id } });
    state = r.state;
    const requestId = (ok(r.result).result as { id: string }).id;
    // Someone withdraws an old release first: the project revision moves.
    const withdrawn = v.releases.find((release) => release.version === "0.2.0")!;
    r = step(state, "reviewer", { action: "WITHDRAW_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { releaseId: withdrawn.id } });
    state = r.state;
    const head = view(state, "volume-reconstruction").releaseETag;
    expect(err(step(state, "reviewer", { action: "APPROVE_RELEASE", projectId: volume, ifMatch: head, idempotencyKey: k(), input: { requestId } }).result)).toBe("APPROVAL_INVALID 409");
  });

  it("withdrawing a historical release keeps the pointer but advances epoch and revision", () => {
    const state = createSeedState();
    const v = view(state, "volume-reconstruction");
    const superseded = v.releases.find((release) => release.version === "0.2.0" && release.state === "PUBLISHED")!;
    const r = step(state, "you", { action: "WITHDRAW_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { releaseId: superseded.id } });
    expect(ok(r.result).result).toEqual({ id: superseded.id, projectId: volume, versionId: superseded.versionId, state: "WITHDRAWN" });
    expect(view(r.state, "volume-reconstruction")).toMatchObject({ currentReleaseId: v.currentReleaseId, visibility: v.visibility, authzEpoch: v.authzEpoch + 1, revision: v.revision + 1 });
  });

  it("a second approval of a fresh request conflicts; a consumed approval is stale, not a conflict", () => {
    const a = approvedRequest(createSeedState(), "volume-reconstruction", "0.2.0");
    expect(err(step(a.state, "reviewer", { action: "APPROVE_RELEASE", projectId: volume, ifMatch: a.head, idempotencyKey: k(), input: { requestId: a.requestId } }).result)).toBe("CONFLICT 409");
    const published = step(a.state, "you", { action: "PUBLISH_RELEASE", projectId: volume, ifMatch: a.head, idempotencyKey: k(), input: { approvalId: a.approvalId } });
    const head = view(published.state, "volume-reconstruction").releaseETag;
    expect(err(step(published.state, "you", { action: "PUBLISH_RELEASE", projectId: volume, ifMatch: head, idempotencyKey: k(), input: { approvalId: a.approvalId } }).result)).toBe("APPROVAL_INVALID 409");
    expect(err(step(published.state, "reviewer", { action: "APPROVE_RELEASE", projectId: volume, ifMatch: head, idempotencyKey: k(), input: { requestId: a.requestId } }).result)).toBe("APPROVAL_INVALID 409");
  });

  it("a publication replays only while its request is unexpired", () => {
    const a = approvedRequest(createSeedState(), "volume-reconstruction", "0.2.0");
    const command: Command = { action: "PUBLISH_RELEASE", projectId: volume, ifMatch: a.head, idempotencyKey: k(), input: { approvalId: a.approvalId } };
    const first = step(a.state, "you", command);
    expect(ok(step(first.state, "you", command, T + 60_000).result).replayed).toBe(true);
    expect(err(step(first.state, "you", command, T + 16 * 60_000).result)).toBe("REPLAY_STALE 409");
  });

  it("a qualification change moves the project revision, so the release head goes stale", () => {
    const state = createSeedState();
    const v = view(state, "volume-reconstruction");
    const after = toggleQualification(toggleQualification(state, "reviewer"), "reviewer");
    expect(view(after, "volume-reconstruction")).toMatchObject({ authzEpoch: v.authzEpoch + 2, revision: v.revision + 2 });
    const version = v.versions.find((item) => item.version === "0.2.0")!;
    expect(err(step(after, "you", { action: "REQUEST_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input: { versionId: version.id, expectedContentHash: version.contentHash, intent: "PUBLISH" } }).result)).toBe("PRECONDITION_FAILED 412");
  });

  it("checks the input shape before any access gate, including the intent/target pairing", () => {
    const state = createSeedState();
    const v = view(state, "volume-reconstruction");
    const version = v.versions[0];
    const request = (persona: string, input: Record<string, unknown>) =>
      err(step(state, persona, { action: "REQUEST_RELEASE", projectId: volume, ifMatch: v.releaseETag, idempotencyKey: k(), input } as Command).result);
    expect(request("you", { versionId: version.id, expectedContentHash: version.contentHash, intent: "ROLLBACK" })).toBe("INVALID_INPUT 422");
    expect(request("you", { versionId: version.id, expectedContentHash: version.contentHash, intent: "PUBLISH", targetReleaseId: v.releases[0].id })).toBe("INVALID_INPUT 422");
    expect(request("guest", { versionId: version.id, expectedContentHash: version.contentHash, intent: "PUBLISH", extra: true })).toBe("INVALID_INPUT 422");
    expect(request("nobody", { versionId: version.id })).toBe("INVALID_INPUT 422");
  });

  it("seeded epochs follow the merged triggers (visibility changes and every withdrawal)", () => {
    const state = createSeedState();
    // sorting-lab: publish 0.9.0 PUBLIC (+1) → withdraw it (+1, PRIVATE) → publish 1.0.0 PUBLIC (+1).
    expect(view(state, "sorting-lab")).toMatchObject({ revision: 4, authzEpoch: 4, visibility: "PUBLIC" });
    // research-notes never released anything.
    expect(view(state, "research-notes")).toMatchObject({ revision: 1, authzEpoch: 1, visibility: "PRIVATE" });
  });

  it("publishes a PRIVATE version like B2-B: the project gets a current release and stays private", () => {
    let state = createSeedState();
    state.projects.find((project) => project.id === notes)!.members.reviewer = ["REVIEWER"];
    let v = view(state, "research-notes");
    state = step(state, "you", { action: "EDIT_DRAFT", projectId: notes, ifMatch: v.draft.etag, idempotencyKey: k(), input: initialPayloadFor("research-notes", "研究笔记工作区") }).state;
    v = view(state, "research-notes");
    state = step(state, "you", { action: "SUBMIT_REVIEW", projectId: notes, ifMatch: v.draft.etag, idempotencyKey: k(), input: { expectedContentHash: v.draft.contentHash! } }).state;
    v = view(state, "research-notes");
    const review = v.reviews[0];
    state = step(state, "reviewer", { action: "DECIDE_REVIEW", projectId: notes, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: review.id, decision: "APPROVED", expectedContentHash: review.contentHash } }).state;
    const sealed = step(state, "you", { action: "SEAL_VERSION", projectId: notes, ifMatch: v.draft.etag, idempotencyKey: k(), input: { reviewId: review.id, expectedContentHash: review.contentHash } });
    const version = versionDTOSchema.parse(ok(sealed.result).result);
    state = sealed.state;
    v = view(state, "research-notes");
    let r = step(state, "you", { action: "REQUEST_RELEASE", projectId: notes, ifMatch: v.releaseETag, idempotencyKey: k(), input: { versionId: version.id, expectedContentHash: version.contentHash, intent: "PUBLISH" } });
    const requestId = (ok(r.result).result as { id: string }).id;
    r = step(r.state, "reviewer", { action: "APPROVE_RELEASE", projectId: notes, ifMatch: v.releaseETag, idempotencyKey: k(), input: { requestId } });
    const approvalId = (ok(r.result).result as { id: string }).id;
    r = step(r.state, "you", { action: "PUBLISH_RELEASE", projectId: notes, ifMatch: v.releaseETag, idempotencyKey: k(), input: { approvalId } });
    const after = view(r.state, "research-notes");
    // PRIVATE → PRIVATE is no visibility change: revision moves, the epoch does not.
    expect(after).toMatchObject({ visibility: "PRIVATE", currentReleaseId: (ok(r.result).result as { id: string }).id, revision: v.revision + 1, authzEpoch: v.authzEpoch });
  });
});

describe("contract gap: starting the next draft", () => {
  it("copies a sealed version into a new DRAFT with a new version number", () => {
    const state = createSeedState();
    const v = view(state, "volume-reconstruction");
    const latest = v.versions.at(-1)!;
    expect(err(step(state, "you", { action: "START_DRAFT", projectId: volume, ifMatch: v.draft.etag, idempotencyKey: k(), input: { fromVersionId: latest.id, version: "0.3.0" } }).result)).toBe("CONFLICT 409");
    const r = step(state, "you", { action: "START_DRAFT", projectId: volume, ifMatch: v.draft.etag, idempotencyKey: k(), input: { fromVersionId: latest.id, version: "0.4.0" } });
    const after = view(r.state, "volume-reconstruction");
    expect(after.draft.head).toMatchObject({ state: "DRAFT", revision: 1 });
    expect(after.draft.head.id).not.toBe(v.draft.head.id);
    expect(after.draft.dto?.payload.manifest.version).toBe("0.4.0");
    expect(draftPayloadSchema.parse(after.draft.dto!.payload)).toBeTruthy();
  });
});

describe("role map parity with the merged protocol", () => {
  it("DRAFT_ROLES equals the private roles map in features/registry/protocol.ts", () => {
    const source = readFileSync("features/registry/protocol.ts", "utf8");
    const block = /const roles: Record<Action, string\[\]> = \{([\s\S]*?)\};/.exec(source)?.[1];
    expect(block, "roles map not found in protocol.ts").toBeTruthy();
    const parsed = Object.fromEntries([...block!.matchAll(/([A-Z_]+): \[([^\]]*)\]/g)].map(([, action, list]) => [action, [...list.matchAll(/"([A-Z]+)"/g)].map((m) => m[1])]));
    expect(parsed).toEqual(Object.fromEntries(Object.entries(DRAFT_ROLES).map(([action, roles]) => [action, [...roles]])));
  });

  it("RELEASE_ROLES and ASSET_ROLES together equal the private roles map in features/registry/release-context.ts", () => {
    const source = readFileSync("features/registry/release-context.ts", "utf8");
    const block = /const roles: Record<Action, string\[\]> = \{([\s\S]*?)\};/.exec(source)?.[1];
    expect(block, "roles map not found in release-context.ts").toBeTruthy();
    const parsed = Object.fromEntries([...block!.matchAll(/([A-Z_]+): \[([^\]]*)\]/g)].map(([, action, list]) => [action, [...list.matchAll(/"([A-Z]+)"/g)].map((m) => m[1])]));
    const copy = (map: Record<string, readonly string[]>) => Object.fromEntries(Object.entries(map).map(([action, roles]) => [action, [...roles]]));
    // Every backend action is classified exactly once: release or internal asset.
    const releaseKeys = Object.keys(RELEASE_ROLES);
    const assetKeys = Object.keys(ASSET_ROLES);
    expect(releaseKeys.filter((action) => assetKeys.includes(action))).toEqual([]);
    expect(Object.keys(parsed).sort()).toEqual([...releaseKeys, ...assetKeys].sort());
    expect(Object.fromEntries(releaseKeys.map((action) => [action, parsed[action]]))).toEqual(copy(RELEASE_ROLES));
    expect(Object.fromEntries(assetKeys.map((action) => [action, parsed[action]]))).toEqual(copy(ASSET_ROLES));
  });
});

describe("internal B3-A asset actions stay out of the console", () => {
  const assetActions = Object.keys(ASSET_ROLES) as AssetAction[];

  it("are not console actions", () => {
    expectTypeOf<Extract<ConsoleAction, AssetAction>>().toBeNever();
    expect(assetActions.sort()).toEqual(["INGEST_ASSET", "VERIFY_ASSET"]);
    for (const action of assetActions) {
      expect(ACTION_ROLES).not.toHaveProperty(action);
      expect(actionMeta).not.toHaveProperty(action);
      expect(commandFunction).not.toHaveProperty(action);
      expect(registryFunctions.map((fn) => fn.action)).not.toContain(action);
      expect(isReleaseAction(action as unknown as ConsoleAction)).toBe(false);
    }
  });

  it("are rejected by the mock even for members holding the backend role", () => {
    const state = createSeedState();
    const v = view(state, "sorting-lab");
    for (const [action, ifMatch] of [["INGEST_ASSET", v.draft.etag], ["VERIFY_ASSET", v.releaseETag]] as const) {
      const forged = { action, projectId: sorting, ifMatch, idempotencyKey: k(), input: {} } as unknown as Command;
      for (const persona of ["you", "reviewer"]) {
        const r = step(state, persona, forged);
        expect(err(r.result)).toBe("INVALID_INPUT 422");
        expect(r.state).toBe(state);
      }
    }
  });
});
