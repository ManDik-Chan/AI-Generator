/*
 * MOCK Registry engine. Pure and synchronous: (state, persona, command, now) → (state, result).
 *
 * It reproduces the observable rules of the merged B2-A library (features/registry/
 * protocol.ts) — check order, ETags, CAS, idempotency receipts, independent review,
 * freshness, error codes and HTTP statuses — so the console can show real protocol
 * behaviour before any HTTP route exists. Release commands follow the unmerged B2-B draft
 * contract and START_DRAFT has no contract at all; both are labelled in the UI.
 *
 * It is NOT a security boundary and NOT a source of truth: identities are personas picked
 * in the UI, nothing is persisted, and a failed command simply returns the previous state
 * (the transaction "rolls back").
 */
import { contentHash, mockUuid } from "@/features/developer-console/content-hash";
import type {
  CommandResponse,
  CommandResult,
  ConsoleAction,
  ConsoleCommand,
  ConsoleProjectView,
  ConsoleRole,
  ConsoleVisibility,
  DraftDTO,
  DraftPayload,
  DraftState,
  ProjectSummary,
  ProtocolErrorCode,
  ReleaseRecordDTO,
  ReleaseRequestDTO,
  ReviewDTO,
  VersionDTO,
} from "@/features/developer-console/model";
import { rolesAllow } from "@/features/developer-console/permissions";

export const REVIEW_TTL_MS = 15 * 60 * 1000;
export const RELEASE_REQUEST_TTL_MS = 15 * 60 * 1000;
export const POLICY_REVISION = 1;
export const HASH_ALGORITHM = "JCS-SHA256-v1" as const;

export interface StoredDraft { id: string; revision: number; state: DraftState; payload: DraftPayload | null; createdAt: number }
export interface StoredReview {
  id: string; draftId: string; draftRevision: number; authzEpoch: number; contentHash: string; visibility: ConsoleVisibility;
  submitterId: string; reviewerId: string | null; decision: "PENDING" | "APPROVED" | "REJECTED"; decidedAt: number | null;
  policyRevision: number; expiresAt: number; createdAt: number;
}
export interface StoredRequest {
  id: string; versionId: string; contentHash: string; intent: "PUBLISH" | "ROLLBACK"; targetReleaseId: string | null;
  visibility: ConsoleVisibility; requesterId: string; expiresAt: number; headRevision: number; createdAt: number;
  approval: { id: string; reviewerId: string; at: number } | null; consumed: boolean;
}
export interface StoredRelease {
  id: string; versionId: string; contentHash: string; visibilityAtApproval: ConsoleVisibility; publishedAt: number;
  withdrawnAt: number | null; intent: "PUBLISH" | "ROLLBACK";
}
interface Receipt { action: ConsoleAction; bodyHash: string; authzEpoch: number; response: Omit<CommandResponse<unknown>, "replayed"> }
export interface StoredProject {
  id: string; slug: string; name: string; visibility: ConsoleVisibility; authzEpoch: number; revision: number;
  currentReleaseId: string | null; members: Record<string, ConsoleRole[]>;
  drafts: StoredDraft[]; reviews: StoredReview[]; invalidations: Record<string, "DRAFT_EDITED" | "WITHDRAWN">;
  versions: VersionDTO[]; requests: StoredRequest[]; releases: StoredRelease[]; receipts: Record<string, Receipt>;
}
export interface MockState { projects: StoredProject[]; qualified: Record<string, boolean>; seq: number }

class Fail extends Error {
  constructor(readonly code: ProtocolErrorCode, readonly status: number) { super(code); }
}
function fail(code: ProtocolErrorCode, status = 409): never { throw new Fail(code, status); }

const KEY = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_ACTIONS = new Set<ConsoleAction>(["REQUEST_RELEASE", "APPROVE_RELEASE", "PUBLISH_RELEASE", "WITHDRAW_RELEASE", "ROLLBACK_RELEASE"]);

export const iso = (ms: number) => new Date(ms).toISOString();
export const draftETag = (draft: { id: string; revision: number }) => `"draft:${draft.id}:${draft.revision}"`;
export const releaseETag = (project: { id: string; revision: number }) => `"release:${project.id}:${project.revision}"`;
export const isReleaseAction = (action: ConsoleAction) => RELEASE_ACTIONS.has(action);

const nextId = (state: MockState, kind: string) => mockUuid(`${kind}:${++state.seq}`);
const activeDraft = (project: StoredProject) => project.drafts[project.drafts.length - 1];
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* ---------------- preconditions and input shape ---------------- */

function draftPrecondition(value: string | undefined) {
  if (!value) return fail("PRECONDITION_REQUIRED", 428);
  const match = /^"draft:([0-9a-f-]{36}):([1-9][0-9]*)"$/.exec(value);
  if (!match || !UUID.test(match[1]) || Number(match[2]) > 2_147_483_647) return fail("INVALID_INPUT", 422);
  return { id: match[1], revision: Number(match[2]) };
}

function releasePrecondition(value: string | undefined, projectId: string) {
  if (!value) return fail("PRECONDITION_REQUIRED", 428);
  const match = /^"release:([0-9a-f-]{36}):([1-9][0-9]*)"$/.exec(value);
  if (!match || match[1] !== projectId || Number(match[2]) > 2_147_483_647) return fail("INVALID_INPUT", 422);
  return { revision: Number(match[2]) };
}

const text = (value: unknown, max = 500) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const id = (value: unknown) => typeof value === "string" && UUID.test(value);

/** Exact key sets, like the strict zod objects of the real library. */
function exact(input: unknown, keys: string[], optional: string[] = []): input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const present = Object.keys(input);
  return keys.every((key) => present.includes(key)) && present.every((key) => keys.includes(key) || optional.includes(key));
}

/**
 * The console only edits a subset of the payload; this checks the fields it can produce.
 * The full contract is draftPayloadSchema in features/registry/contracts.ts — fixtures and
 * every payload the editor can emit are checked against it in engine.test.ts.
 */
export function payloadIssues(payload: DraftPayload, project: { id: string; slug: string }): string[] {
  const issues: string[] = [];
  const { manifest, presentation } = payload;
  if (manifest.projectId !== project.id || manifest.slug !== project.slug) issues.push("manifest 不属于当前项目");
  if (!text(manifest.name)) issues.push("名称需要 1–500 个字符");
  if (!text(manifest.summary)) issues.push("简介需要 1–500 个字符");
  if (!SEMVER.test(manifest.version)) issues.push("版本必须是 MAJOR.MINOR.PATCH");
  if (!["PRIVATE", "UNLISTED", "PUBLIC"].includes(manifest.visibility)) issues.push("可见性无效");
  if (presentation.version !== manifest.version || presentation.projectId !== manifest.projectId) issues.push("展示区块的项目或版本与 manifest 不一致");
  if (!text(presentation.title)) issues.push("展示标题需要 1–500 个字符");
  for (const section of presentation.sections) {
    if (section.kind === "MARKDOWN" && section.body.length > 20_000) issues.push(`区块 ${section.id} 超过 20000 字符`);
  }
  return issues;
}

function checkInput(command: ConsoleCommand, project: StoredProject) {
  const input: unknown = command.input;
  const ok = (() => {
    try {
    switch (command.action) {
      case "EDIT_DRAFT": return exact(input, ["manifest", "presentation", "documentation"]) && payloadIssues(command.input, project).length === 0;
      case "SUBMIT_REVIEW": return exact(input, ["expectedContentHash"]) && hash(input.expectedContentHash);
      case "WITHDRAW_REVIEW": return exact(input, ["reviewId"]) && id(input.reviewId);
      case "DECIDE_REVIEW": return exact(input, ["reviewId", "decision", "expectedContentHash"]) && id(input.reviewId) && hash(input.expectedContentHash) && ["APPROVED", "REJECTED"].includes(input.decision as string);
      case "SEAL_VERSION": return exact(input, ["reviewId", "expectedContentHash"]) && id(input.reviewId) && hash(input.expectedContentHash);
      case "REQUEST_RELEASE": return exact(input, ["versionId", "expectedContentHash", "intent"], ["targetReleaseId"]) && id(input.versionId) && hash(input.expectedContentHash)
        && ["PUBLISH", "ROLLBACK"].includes(input.intent as string) && (input.targetReleaseId === undefined || id(input.targetReleaseId));
      case "APPROVE_RELEASE": return exact(input, ["requestId"]) && id(input.requestId);
      case "PUBLISH_RELEASE":
      case "ROLLBACK_RELEASE": return exact(input, ["approvalId"]) && id(input.approvalId);
      case "WITHDRAW_RELEASE": return exact(input, ["releaseId"]) && id(input.releaseId);
      case "START_DRAFT": return exact(input, ["fromVersionId", "version"]) && id(input.fromVersionId) && SEMVER.test(String(input.version));
    }
    } catch {
      return false;
    }
  })();
  if (!ok) fail("INVALID_INPUT", 422);
}

/* ---------------- freshness ---------------- */

function holds(state: MockState, project: StoredProject, personaId: string | null, action: ConsoleAction) {
  return Boolean(personaId) && state.qualified[personaId!] === true && rolesAllow(project.members[personaId!] ?? [], action);
}

/** Why a review can no longer be acted on, or null. Mirrors freshness() in protocol.ts. */
function reviewProblem(state: MockState, project: StoredProject, draft: StoredDraft, review: StoredReview, now: number, withReviewer: boolean): { code: ProtocolErrorCode; status: number } | null {
  if (draft.state !== "IN_REVIEW" || draft.revision !== review.draftRevision || review.authzEpoch !== project.authzEpoch
    || review.policyRevision !== POLICY_REVISION || review.expiresAt <= now || project.invalidations[review.id]) return { code: "REVIEW_INVALID", status: 409 };
  if (!draft.payload || contentHash(draft.payload) !== review.contentHash) return { code: "HASH_MISMATCH", status: 409 };
  if (!holds(state, project, review.submitterId, "SUBMIT_REVIEW")) return { code: "FORBIDDEN", status: 403 };
  if (withReviewer) {
    if (!review.reviewerId || review.reviewerId === review.submitterId) return { code: "REVIEW_INVALID", status: 409 };
    if (!holds(state, project, review.reviewerId, "DECIDE_REVIEW")) return { code: "FORBIDDEN", status: 403 };
  }
  return null;
}

function requireFreshReview(state: MockState, project: StoredProject, draft: StoredDraft, review: StoredReview, now: number, expected: string, withReviewer = false) {
  const problem = reviewProblem(state, project, draft, review, now, withReviewer);
  if (problem) fail(problem.code, problem.status);
  if (review.contentHash !== expected) fail("HASH_MISMATCH");
}

function requestProblem(state: MockState, project: StoredProject, request: StoredRequest, now: number): boolean {
  return request.expiresAt <= now || request.headRevision !== project.revision || !holds(state, project, request.requesterId, "REQUEST_RELEASE")
    || (request.approval !== null && !holds(state, project, request.approval.reviewerId, "APPROVE_RELEASE"));
}

/* ---------------- DTO projection ---------------- */

export function draftDTO(project: StoredProject, draft: StoredDraft): DraftDTO | null {
  if (!draft.payload) return null;
  return { id: draft.id, projectId: project.id, revision: draft.revision, state: draft.state, payload: clone(draft.payload) };
}

function effectiveState(state: MockState, project: StoredProject, review: StoredReview, now: number): ReviewDTO["effectiveState"] {
  if (project.invalidations[review.id]) return "INVALIDATED";
  const draft = project.drafts.find((item) => item.id === review.draftId);
  if (!draft) return "INVALIDATED";
  const version = project.versions.find((item) => item.reviewId === review.id);
  if (version && draft.state === "PUBLISHED" && review.decision === "APPROVED") return version.contentHash === review.contentHash ? "SEALED" : "INVALIDATED";
  return reviewProblem(state, project, draft, review, now, review.decision === "APPROVED") ? "INVALIDATED" : review.decision;
}

export function reviewDTO(state: MockState, project: StoredProject, review: StoredReview, now: number, override?: ReviewDTO["effectiveState"]): ReviewDTO {
  return {
    id: review.id, projectId: project.id, draftId: review.draftId, draftRevision: review.draftRevision, decision: review.decision,
    effectiveState: override ?? effectiveState(state, project, review, now), contentHash: review.contentHash, expiresAt: iso(review.expiresAt),
  };
}

function requestDTO(project: StoredProject, request: StoredRequest): ReleaseRequestDTO {
  const version = project.versions.find((item) => item.id === request.versionId);
  return {
    id: request.id, projectId: project.id, versionId: request.versionId, version: version?.version ?? "?", contentHash: request.contentHash,
    intent: request.intent, targetReleaseId: request.targetReleaseId, visibility: request.visibility, expiresAt: iso(request.expiresAt),
    approvalId: request.approval?.id ?? null, state: request.consumed ? "CONSUMED" : request.approval ? "APPROVED" : "PENDING",
  };
}

function releaseDTO(project: StoredProject, release: StoredRelease): ReleaseRecordDTO {
  const version = project.versions.find((item) => item.id === release.versionId);
  return {
    id: release.id, projectId: project.id, versionId: release.versionId, version: version?.version ?? "?", contentHash: release.contentHash,
    visibilityAtApproval: release.visibilityAtApproval, state: release.withdrawnAt === null ? "PUBLISHED" : "WITHDRAWN",
    publishedAt: iso(release.publishedAt), withdrawnAt: release.withdrawnAt === null ? null : iso(release.withdrawnAt), intent: release.intent,
  };
}

/* ---------------- commands ---------------- */

type Work = Omit<CommandResponse<unknown>, "replayed">;

function invalidateDraftReviews(project: StoredProject, draft: StoredDraft, reason: "DRAFT_EDITED" | "WITHDRAWN") {
  for (const review of project.reviews) if (review.draftId === draft.id && !project.invalidations[review.id]) project.invalidations[review.id] = reason;
}

function findReview(project: StoredProject, draft: StoredDraft, reviewId: string) {
  return project.reviews.find((review) => review.id === reviewId && review.draftId === draft.id) ?? fail("NOT_FOUND", 404);
}

function draftWork(state: MockState, project: StoredProject, draft: StoredDraft, personaId: string, command: ConsoleCommand, now: number): Work {
  switch (command.action) {
    case "EDIT_DRAFT": {
      if (draft.state !== "DRAFT") fail("CONFLICT");
      invalidateDraftReviews(project, draft, "DRAFT_EDITED");
      draft.payload = clone(command.input);
      draft.revision += 1;
      return { result: draftDTO(project, draft), etag: draftETag(draft) };
    }
    case "SUBMIT_REVIEW": {
      if (draft.state !== "DRAFT") fail("CONFLICT");
      if (!draft.payload) fail("DRAFT_UNINITIALIZED");
      const digest = contentHash(draft.payload);
      if (command.input.expectedContentHash !== digest) fail("HASH_MISMATCH");
      draft.state = "IN_REVIEW";
      draft.revision += 1;
      const review: StoredReview = {
        id: nextId(state, "review"), draftId: draft.id, draftRevision: draft.revision, authzEpoch: project.authzEpoch, contentHash: digest,
        visibility: draft.payload.manifest.visibility, submitterId: personaId, reviewerId: null, decision: "PENDING", decidedAt: null,
        policyRevision: POLICY_REVISION, expiresAt: now + REVIEW_TTL_MS, createdAt: now,
      };
      project.reviews.push(review);
      return { result: reviewDTO(state, project, review, now), etag: draftETag(draft) };
    }
    case "WITHDRAW_REVIEW": {
      const review = findReview(project, draft, command.input.reviewId);
      if (draft.state !== "IN_REVIEW") fail("CONFLICT");
      invalidateDraftReviews(project, draft, "WITHDRAWN");
      draft.state = "DRAFT";
      draft.revision += 1;
      return { result: reviewDTO(state, project, review, now, "INVALIDATED"), etag: draftETag(draft) };
    }
    case "DECIDE_REVIEW": {
      const review = findReview(project, draft, command.input.reviewId);
      if (review.submitterId === personaId) fail("FORBIDDEN", 403);
      if (review.decision !== "PENDING") fail("CONFLICT");
      requireFreshReview(state, project, draft, review, now, command.input.expectedContentHash);
      review.decision = command.input.decision;
      review.reviewerId = personaId;
      review.decidedAt = now;
      requireFreshReview(state, project, draft, review, now, command.input.expectedContentHash, true);
      return { result: reviewDTO(state, project, review, now), etag: draftETag(draft) };
    }
    case "SEAL_VERSION": {
      const review = findReview(project, draft, command.input.reviewId);
      if (review.decision !== "APPROVED") fail("REVIEW_INVALID");
      requireFreshReview(state, project, draft, review, now, command.input.expectedContentHash, true);
      const payload = draft.payload!;
      if (project.versions.some((version) => version.version === payload.manifest.version)) fail("CONFLICT");
      const version: VersionDTO = {
        id: nextId(state, "version"), projectId: project.id, version: payload.manifest.version, snapshot: clone(payload),
        contentHash: review.contentHash, hashAlgorithm: HASH_ALGORITHM, reviewId: review.id, createdAt: iso(now),
      };
      project.versions.push(version);
      draft.state = "PUBLISHED"; // B1 meaning: frozen into a Version, not a public release.
      draft.revision += 1;
      return { result: clone(version), etag: draftETag(draft) };
    }
    case "START_DRAFT": {
      if (draft.state !== "PUBLISHED") fail("CONFLICT");
      const source = project.versions.find((version) => version.id === command.input.fromVersionId) ?? fail("NOT_FOUND", 404);
      if (project.versions.some((version) => version.version === command.input.version)) fail("CONFLICT");
      const payload = clone(source.snapshot);
      payload.manifest.version = command.input.version;
      payload.presentation.version = command.input.version;
      const next: StoredDraft = { id: nextId(state, "draft"), revision: 1, state: "DRAFT", payload, createdAt: now };
      project.drafts.push(next);
      return { result: draftDTO(project, next), etag: draftETag(next) };
    }
    default:
      return fail("INVALID_INPUT", 422);
  }
}

function releaseWork(state: MockState, project: StoredProject, personaId: string, command: ConsoleCommand, now: number): Work {
  switch (command.action) {
    case "REQUEST_RELEASE": {
      const { versionId, expectedContentHash, intent, targetReleaseId } = command.input;
      const version = project.versions.find((item) => item.id === versionId) ?? fail("NOT_FOUND", 404);
      if (contentHash(version.snapshot) !== version.contentHash || expectedContentHash !== version.contentHash) fail("HASH_MISMATCH");
      const visibility = version.snapshot.manifest.visibility;
      // A PRIVATE manifest has no public projection, so there is nothing to release.
      if (visibility === "PRIVATE") fail("APPROVAL_INVALID");
      if (intent === "ROLLBACK") {
        const target = project.releases.find((item) => item.id === targetReleaseId) ?? fail("NOT_FOUND", 404);
        if (target.id === project.currentReleaseId || target.versionId !== version.id) fail("APPROVAL_INVALID");
      } else if (targetReleaseId) fail("INVALID_INPUT", 422);
      const request: StoredRequest = {
        id: nextId(state, "release-request"), versionId, contentHash: version.contentHash, intent, targetReleaseId: targetReleaseId ?? null,
        visibility, requesterId: personaId, expiresAt: now + RELEASE_REQUEST_TTL_MS, headRevision: project.revision, createdAt: now,
        approval: null, consumed: false,
      };
      project.requests.push(request);
      return { result: requestDTO(project, request), etag: releaseETag(project) };
    }
    case "APPROVE_RELEASE": {
      const request = project.requests.find((item) => item.id === command.input.requestId) ?? fail("NOT_FOUND", 404);
      if (request.requesterId === personaId) fail("FORBIDDEN", 403);
      if (request.approval || request.consumed) fail("CONFLICT");
      if (requestProblem(state, project, request, now)) fail("APPROVAL_INVALID");
      request.approval = { id: nextId(state, "release-approval"), reviewerId: personaId, at: now };
      return { result: requestDTO(project, request), etag: releaseETag(project) };
    }
    case "PUBLISH_RELEASE":
    case "ROLLBACK_RELEASE": {
      const request = project.requests.find((item) => item.approval?.id === command.input.approvalId) ?? fail("NOT_FOUND", 404);
      const intent = command.action === "ROLLBACK_RELEASE" ? "ROLLBACK" : "PUBLISH";
      if (request.intent !== intent || request.requesterId !== personaId) fail("APPROVAL_INVALID");
      if (request.consumed) fail("CONFLICT");
      if (requestProblem(state, project, request, now)) fail("APPROVAL_INVALID");
      const version = project.versions.find((item) => item.id === request.versionId) ?? fail("NOT_FOUND", 404);
      if (contentHash(version.snapshot) !== request.contentHash) fail("HASH_MISMATCH");
      if (intent === "ROLLBACK" && (!request.targetReleaseId || request.targetReleaseId === project.currentReleaseId)) fail("APPROVAL_INVALID");
      const release: StoredRelease = {
        id: nextId(state, "release"), versionId: version.id, contentHash: request.contentHash, visibilityAtApproval: request.visibility,
        publishedAt: now, withdrawnAt: null, intent,
      };
      project.releases.push(release);
      request.consumed = true;
      project.currentReleaseId = release.id;
      if (project.visibility !== request.visibility) { project.visibility = request.visibility; project.authzEpoch += 1; }
      project.revision += 1;
      return { result: releaseDTO(project, release), etag: releaseETag(project) };
    }
    case "WITHDRAW_RELEASE": {
      const release = project.releases.find((item) => item.id === command.input.releaseId) ?? fail("NOT_FOUND", 404);
      if (release.withdrawnAt !== null) fail("CONFLICT");
      release.withdrawnAt = now;
      if (project.currentReleaseId === release.id) {
        project.currentReleaseId = null;
        if (project.visibility !== "PRIVATE") { project.visibility = "PRIVATE"; project.authzEpoch += 1; }
      }
      project.revision += 1;
      return { result: releaseDTO(project, release), etag: releaseETag(project) };
    }
    default:
      return fail("INVALID_INPUT", 422);
  }
}

function replay(state: MockState, project: StoredProject, receipt: Receipt, action: ConsoleAction, now: number): CommandResponse<unknown> {
  if (receipt.authzEpoch !== project.authzEpoch) fail("REPLAY_STALE");
  const result = receipt.response.result as { id?: string } | null;
  if (action === "SUBMIT_REVIEW" || action === "DECIDE_REVIEW") {
    const review = project.reviews.find((item) => item.id === result?.id);
    const draft = review && project.drafts.find((item) => item.id === review.draftId);
    if (!review || !draft || reviewProblem(state, project, draft, review, now, review.decision !== "PENDING")) fail("REPLAY_STALE");
  }
  if (action === "REQUEST_RELEASE" || action === "APPROVE_RELEASE") {
    const request = project.requests.find((item) => item.id === result?.id);
    if (!request || requestProblem(state, project, request, now)) fail("REPLAY_STALE");
  }
  if (action === "PUBLISH_RELEASE" || action === "ROLLBACK_RELEASE") {
    const release = project.releases.find((item) => item.id === result?.id);
    if (!release || release.withdrawnAt !== null || project.currentReleaseId !== release.id) fail("REPLAY_STALE");
  }
  return { ...clone(receipt.response), replayed: true };
}

function run(state: MockState, personaId: string, command: ConsoleCommand, now: number): CommandResponse<unknown> {
  if (!KEY.test(command.idempotencyKey)) fail("INVALID_INPUT", 422);
  const release = isReleaseAction(command.action);
  const releaseExpected = release ? releasePrecondition(command.ifMatch, command.projectId) : null;
  const draftExpected = release ? null : draftPrecondition(command.ifMatch);
  if (!(personaId in state.qualified)) fail("AUTH_REQUIRED", 401);
  // Gate 2: the separately granted internal operator qualification.
  if (!state.qualified[personaId]) fail("FORBIDDEN", 403);
  const project = state.projects.find((item) => item.id === command.projectId) ?? fail("NOT_FOUND", 404);
  // Gate 3: a member without one of the action's roles cannot tell the project exists.
  if (!rolesAllow(project.members[personaId] ?? [], command.action)) fail("NOT_FOUND", 404);
  checkInput(command, project);

  const bodyHash = contentHash({ action: command.action, projectId: command.projectId, ifMatch: command.ifMatch, input: command.input });
  const key = `${personaId}|${command.idempotencyKey}`;
  const receipt = project.receipts[key];
  if (receipt) {
    if (receipt.action !== command.action || receipt.bodyHash !== bodyHash) fail("IDEMPOTENCY_CONFLICT");
    return replay(state, project, receipt, command.action, now);
  }

  let work: Work;
  if (releaseExpected) {
    if (project.revision !== releaseExpected.revision) fail("PRECONDITION_FAILED", 412);
    work = releaseWork(state, project, personaId, command, now);
  } else {
    const draft = project.drafts.find((item) => item.id === draftExpected!.id) ?? fail("NOT_FOUND", 404);
    if (draft.revision !== draftExpected!.revision) fail("PRECONDITION_FAILED", 412);
    work = draftWork(state, project, draft, personaId, command, now);
  }
  project.receipts[key] = { action: command.action, bodyHash, authzEpoch: project.authzEpoch, response: clone(work) };
  return { ...work, replayed: false };
}

/** Executes one command. On failure the input state is returned untouched (rollback). */
export function execute(input: MockState, personaId: string, command: ConsoleCommand, now: number): { state: MockState; result: CommandResult } {
  const state = clone(input);
  try {
    return { state, result: { ok: true, response: run(state, personaId, command, now) } };
  } catch (error) {
    if (error instanceof Fail) return { state: input, result: { ok: false, error: { code: error.code, status: error.status } } };
    throw error;
  }
}

/* ---------------- environment events (not commands) ---------------- */

/** Revoking or restoring an operator qualification advances the epoch of every project the persona belongs to (B1 guard_operator). */
export function toggleQualification(input: MockState, personaId: string): MockState {
  const state = clone(input);
  state.qualified[personaId] = !state.qualified[personaId];
  for (const project of state.projects) if (project.members[personaId]) project.authzEpoch += 1;
  return state;
}

/* ---------------- read model ---------------- */

export function projectView(state: MockState, projectId: string, personaId: string, now: number): ConsoleProjectView | null {
  const project = state.projects.find((item) => item.id === projectId || item.slug === projectId);
  if (!project) return null;
  const draft = activeDraft(project);
  return {
    id: project.id, slug: project.slug, name: project.name, visibility: project.visibility, authzEpoch: project.authzEpoch,
    revision: project.revision, releaseETag: releaseETag(project), currentReleaseId: project.currentReleaseId,
    members: Object.entries(project.members).map(([id, roles]) => ({ personaId: id, roles: [...roles] })),
    draft: {
      head: { id: draft.id, projectId: project.id, revision: draft.revision, state: draft.state }, etag: draftETag(draft),
      dto: draftDTO(project, draft), contentHash: draft.payload ? contentHash(draft.payload) : null,
    },
    reviews: project.reviews.filter((review) => review.draftId === draft.id).slice().reverse()
      .map((review) => ({ ...reviewDTO(state, project, review, now), submittedByViewer: review.submitterId === personaId })),
    versions: clone(project.versions),
    releases: project.releases.slice().reverse().map((release) => releaseDTO(project, release)),
    releaseRequests: project.requests.slice().reverse().map((request) => ({
      ...requestDTO(project, request), requestedByViewer: request.requesterId === personaId, approvedByViewer: request.approval?.reviewerId === personaId,
    })),
  };
}

export function projectSummaries(state: MockState, personaId: string, now: number): ProjectSummary[] {
  return state.projects.map((project) => {
    const draft = activeDraft(project);
    const current = project.releases.find((release) => release.id === project.currentReleaseId);
    const pendingReview = project.reviews.some((review) => review.draftId === draft.id && review.decision === "PENDING"
      && effectiveState(state, project, review, now) === "PENDING");
    return {
      id: project.id, slug: project.slug, name: project.name, visibility: project.visibility, draftState: draft.state, draftRevision: draft.revision,
      draftVersion: draft.payload?.manifest.version ?? null, latestVersion: project.versions.at(-1)?.version ?? null,
      currentRelease: current ? project.versions.find((version) => version.id === current.versionId)?.version ?? null : null,
      pendingReview, roles: [...(project.members[personaId] ?? [])],
    };
  });
}

/** Signature of every time-bound record that has expired; changes when the clock crosses a deadline. */
export function expirySignature(state: MockState, now: number) {
  return state.projects.flatMap((project) => [
    ...project.reviews.filter((review) => review.expiresAt <= now).map((review) => review.id),
    ...project.requests.filter((request) => request.expiresAt <= now).map((request) => request.id),
  ]).join(",");
}

