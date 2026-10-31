/*
 * Read model and command contract of the developer console.
 *
 * The console talks to one ConsoleAdapter (adapter.ts). Today the only implementation is
 * the typed mock in ./mock, which runs entirely in the browser and saves nothing. When the
 * Registry gets HTTP routes, a second adapter maps the same commands to them; the screens
 * keep using these types.
 *
 * DTO types are imported, type-only, from the merged Registry contracts so a contract
 * change fails typecheck here instead of drifting silently. `import type` is erased at
 * build time: nothing from the server-only Registry modules reaches the browser.
 */
import type { DraftDTO, DraftPayload, VersionDTO } from "@/features/registry/contracts";
import type { CommandResponse } from "@/features/registry/protocol";
import type { Action as RegistryReleaseAction } from "@/features/registry/release-context";

export type { CommandResponse, DraftDTO, DraftPayload, VersionDTO };

export type ConsoleRole = "OWNER" | "EDITOR" | "REVIEWER" | "PUBLISHER" | "VIEWER";
export type ConsoleVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type DraftState = DraftDTO["state"];

/** Actions of the merged B2-A protocol (features/registry/protocol.ts). */
export type DraftAction = "READ_DRAFT" | "EDIT_DRAFT" | "SUBMIT_REVIEW" | "WITHDRAW_REVIEW" | "DECIDE_REVIEW" | "SEAL_VERSION";
/** Actions of the merged B2-B release library (type-only: features/registry/release-context.ts is server-only). */
export type ReleaseAction = RegistryReleaseAction;
/** Not in any contract yet: starting the next draft after a version is sealed. */
export type GapAction = "START_DRAFT";
export type ConsoleAction = DraftAction | ReleaseAction | GapAction;

/** Stable error codes. The first group is what protocol.ts returns today. */
export type ProtocolErrorCode =
  | "AUTH_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT" | "PRECONDITION_REQUIRED" | "PRECONDITION_FAILED"
  | "IDEMPOTENCY_CONFLICT" | "REPLAY_STALE" | "REVIEW_INVALID" | "HASH_MISMATCH" | "CONFLICT" | "DRAFT_UNINITIALIZED"
  | "DISABLED" | "UNAVAILABLE"
  // release.ts (P1-B2-B)
  | "APPROVAL_INVALID";

export interface ProtocolError {
  code: ProtocolErrorCode;
  status: number;
}

/**
 * Mirrors the object returned by reviewDTO() in features/registry/protocol.ts, which does
 * not export a type for it. Contract request C-2 in the handoff asks for an export.
 */
export interface ReviewDTO {
  id: string;
  projectId: string;
  draftId: string;
  draftRevision: number;
  decision: "PENDING" | "APPROVED" | "REJECTED" | "INVALIDATED";
  effectiveState: "PENDING" | "APPROVED" | "REJECTED" | "INVALIDATED" | "SEALED";
  contentHash: string;
  expiresAt: string;
}

/**
 * Console read model of a release request and its approval (registry_private.release_requests /
 * release_approvals). B2-B has no read for these yet; see contract request C-6.
 */
export interface ReleaseRequestDTO {
  id: string;
  projectId: string;
  versionId: string;
  version: string;
  contentHash: string;
  intent: "PUBLISH" | "ROLLBACK";
  targetReleaseId: string | null;
  visibility: ConsoleVisibility;
  expiresAt: string;
  approvalId: string | null;
  state: "PENDING" | "APPROVED" | "CONSUMED";
}

/** Console read model of public.project_releases plus withdrawal facts. No list read exists yet (C-6). */
export interface ReleaseRecordDTO {
  id: string;
  projectId: string;
  versionId: string;
  version: string;
  contentHash: string;
  visibilityAtApproval: ConsoleVisibility;
  state: "PUBLISHED" | "WITHDRAWN";
  publishedAt: string;
  withdrawnAt: string | null;
  intent: "PUBLISH" | "ROLLBACK";
}

export interface ConsolePersona {
  id: string;
  name: string;
  /** One line on who this is in the scenario. */
  note: string;
}

export interface ConsoleMember {
  personaId: string;
  roles: ConsoleRole[];
}

/** Everything one screen needs about one project, from the acting persona's point of view. */
export interface ConsoleProjectView {
  id: string;
  slug: string;
  name: string;
  /** Live project visibility. It only changes through a release or a withdrawal. */
  visibility: ConsoleVisibility;
  authzEpoch: number;
  revision: number;
  releaseETag: string;
  currentReleaseId: string | null;
  members: ConsoleMember[];
  draft: {
    head: { id: string; projectId: string; revision: number; state: DraftState };
    etag: string;
    /** null when the stored payload is the empty B1 record (DRAFT_UNINITIALIZED). */
    dto: DraftDTO | null;
    contentHash: string | null;
  };
  /** Newest first. `submittedByViewer` is not in the real DTO (contract request C-3). */
  reviews: (ReviewDTO & { submittedByViewer: boolean })[];
  /** Oldest first. */
  versions: VersionDTO[];
  /** Newest first. */
  releases: ReleaseRecordDTO[];
  /** Newest first. */
  releaseRequests: (ReleaseRequestDTO & { requestedByViewer: boolean; approvedByViewer: boolean })[];
}

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  visibility: ConsoleVisibility;
  draftState: DraftState;
  draftRevision: number;
  draftVersion: string | null;
  latestVersion: string | null;
  currentRelease: string | null;
  pendingReview: boolean;
  roles: ConsoleRole[];
}

/* ---------------- commands ---------------- */

interface CommandBase<A extends ConsoleAction, I> {
  action: A;
  projectId: string;
  /** Strong ETag; required by every write. */
  ifMatch?: string;
  idempotencyKey: string;
  input: I;
}

export type ConsoleCommand =
  | CommandBase<"EDIT_DRAFT", DraftPayload>
  | CommandBase<"SUBMIT_REVIEW", { expectedContentHash: string }>
  | CommandBase<"WITHDRAW_REVIEW", { reviewId: string }>
  | CommandBase<"DECIDE_REVIEW", { reviewId: string; decision: "APPROVED" | "REJECTED"; expectedContentHash: string }>
  | CommandBase<"SEAL_VERSION", { reviewId: string; expectedContentHash: string }>
  | CommandBase<"REQUEST_RELEASE", { versionId: string; expectedContentHash: string; intent: "PUBLISH" | "ROLLBACK"; targetReleaseId?: string }>
  | CommandBase<"APPROVE_RELEASE", { requestId: string }>
  | CommandBase<"PUBLISH_RELEASE", { approvalId: string }>
  | CommandBase<"WITHDRAW_RELEASE", { releaseId: string }>
  | CommandBase<"ROLLBACK_RELEASE", { approvalId: string }>
  | CommandBase<"START_DRAFT", { fromVersionId: string; version: string }>;

export type CommandResult =
  | { ok: true; response: CommandResponse<unknown> }
  | { ok: false; error: ProtocolError };

/** The library function each action maps to; shown in the protocol log. */
export const commandFunction: Record<ConsoleCommand["action"], string> = {
  EDIT_DRAFT: "editRegistryDraft",
  SUBMIT_REVIEW: "submitRegistryDraft",
  WITHDRAW_REVIEW: "withdrawRegistryReview",
  DECIDE_REVIEW: "decideRegistryReview",
  SEAL_VERSION: "sealRegistryVersion",
  REQUEST_RELEASE: "requestRegistryReleaseApproval",
  APPROVE_RELEASE: "approveRegistryRelease",
  PUBLISH_RELEASE: "publishRegistryRelease",
  WITHDRAW_RELEASE: "withdrawRegistryRelease",
  ROLLBACK_RELEASE: "rollbackRegistryRelease",
  START_DRAFT: "（无对应接口）",
};

export interface ProtocolLogEntry {
  seq: number;
  /** Mock clock, ISO. */
  at: string;
  personaId: string;
  action: ConsoleCommand["action"];
  fn: string;
  projectId: string;
  ifMatch?: string;
  idempotencyKey: string;
  input: unknown;
  result: CommandResult;
  /** True when this request was produced by the "replay" tool. */
  replayOf?: number;
}
