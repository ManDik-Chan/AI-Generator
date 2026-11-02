import type { PlatformMember, PlatformRole, RoleChangeFailureCode, RoleChangeOutcome, RoleChangeRequest } from "@/features/admin/rbac/contract";
import { isRetryableFailure } from "@/features/admin/rbac/copy";

/*
 * State for the member directory: at most one open role-change dialog, plus a per-row notice
 * that outlives the dialog. The rules that keep stale permissions off screen:
 *
 * - After a successful change the row shows the server-confirmed role and its actions stay
 *   locked until a server snapshot shows the member at a new roleVersion.
 * - After a failure that may mean the screen is out of date (conflict, forbidden, unknown
 *   outcome...) the row stays locked until the next server snapshot.
 * - If a snapshot changes the member while the dialog is open, the pending choice is dropped
 *   and the dialog re-bases on the fresh role and fresh assignable roles.
 */

export interface RoleChangeFailure {
  code: RoleChangeFailureCode;
  currentRole?: PlatformRole;
  retryAfterSeconds?: number;
  retryable: boolean;
}

export interface RoleChangeSession {
  memberId: string;
  baseRole: PlatformRole;
  baseVersion: string;
  nextRole: PlatformRole | null;
  status: "editing" | "saving" | "failed";
  failure: RoleChangeFailure | null;
  /** Set when fresh server data replaced the member under an open dialog. */
  supersededFrom: PlatformRole | null;
}

export type RowNotice =
  | { kind: "applied"; fromRole: PlatformRole; toRole: PlatformRole; previousVersion: string; synced: boolean }
  | { kind: "rejected"; code: RoleChangeFailureCode; currentRole?: PlatformRole; retryAfterSeconds?: number; locked: boolean };

export interface DirectoryState {
  /** Latest server roleVersion per member. */
  versions: Record<string, string>;
  session: RoleChangeSession | null;
  notices: Record<string, RowNotice>;
}

export type DirectoryEvent =
  | { type: "open"; member: PlatformMember }
  | { type: "select"; role: PlatformRole }
  | { type: "close" }
  | { type: "submit" }
  | { type: "resolved"; outcome: RoleChangeOutcome }
  | { type: "serverData"; members: PlatformMember[] };

const versionsOf = (members: PlatformMember[]) => Object.fromEntries(members.map((member) => [member.id, member.roleVersion]));

export const initialDirectoryState = (members: PlatformMember[]): DirectoryState => ({ versions: versionsOf(members), session: null, notices: {} });

export function isRowLocked(notice: RowNotice | undefined) {
  if (!notice) return false;
  return notice.kind === "applied" ? !notice.synced : notice.locked;
}

/** The role to show for a member: the server-confirmed result of a change until fresh data arrives. */
export function displayedRole(member: PlatformMember, notice: RowNotice | undefined): PlatformRole {
  return notice?.kind === "applied" && !notice.synced ? notice.toRole : member.platformRole;
}

const onlyOption = (member: PlatformMember) => (member.roleChange.assignableRoles.length === 1 ? member.roleChange.assignableRoles[0] : null);

function without<T>(record: Record<string, T>, key: string) {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export function canSubmit(session: RoleChangeSession | null) {
  if (!session || !session.nextRole) return false;
  return session.status === "editing" || (session.status === "failed" && Boolean(session.failure?.retryable));
}

export function buildRoleChangeRequest(session: RoleChangeSession): RoleChangeRequest | null {
  if (!session.nextRole) return null;
  return { profileId: session.memberId, expectedRole: session.baseRole, expectedVersion: session.baseVersion, nextRole: session.nextRole };
}

export function directoryReducer(state: DirectoryState, event: DirectoryEvent): DirectoryState {
  const { session } = state;
  switch (event.type) {
    case "open": {
      const { member } = event;
      if (session?.status === "saving") return state;
      if (isRowLocked(state.notices[member.id]) || member.roleChange.assignableRoles.length === 0) return state;
      return {
        ...state,
        notices: without(state.notices, member.id),
        session: { memberId: member.id, baseRole: member.platformRole, baseVersion: member.roleVersion, nextRole: onlyOption(member), status: "editing", failure: null, supersededFrom: null },
      };
    }
    case "select": {
      if (!session || session.status === "saving") return state;
      if (session.status === "failed" && !session.failure?.retryable) return state;
      return { ...state, session: { ...session, nextRole: event.role, status: "editing", failure: null } };
    }
    case "close":
      return !session || session.status === "saving" ? state : { ...state, session: null };
    case "submit":
      return canSubmit(session) ? { ...state, session: { ...session!, status: "saving", failure: null } } : state;
    case "resolved": {
      if (!session || session.status !== "saving") return state;
      const { outcome } = event;
      if (outcome.ok) {
        const latest = state.versions[session.memberId];
        return {
          ...state,
          session: null,
          notices: {
            ...state.notices,
            // If a snapshot already moved past the version we changed, the screen is already fresh.
            [session.memberId]: { kind: "applied", fromRole: session.baseRole, toRole: outcome.member.platformRole, previousVersion: session.baseVersion, synced: latest !== undefined && latest !== session.baseVersion },
          },
        };
      }
      const retryable = isRetryableFailure(outcome.code);
      const failure: RoleChangeFailure = { code: outcome.code, currentRole: outcome.currentRole, retryAfterSeconds: outcome.retryAfterSeconds, retryable };
      return {
        ...state,
        session: { ...session, status: "failed", failure },
        notices: retryable
          ? state.notices
          : { ...state.notices, [session.memberId]: { kind: "rejected", code: outcome.code, currentRole: outcome.currentRole, retryAfterSeconds: outcome.retryAfterSeconds, locked: true } },
      };
    }
    case "serverData": {
      const byId = new Map(event.members.map((member) => [member.id, member]));
      const notices: Record<string, RowNotice> = {};
      for (const [id, notice] of Object.entries(state.notices)) {
        const member = byId.get(id);
        if (!member) continue;
        if (notice.kind === "rejected") {
          notices[id] = { ...notice, locked: false };
          continue;
        }
        const synced = notice.synced || member.roleVersion !== notice.previousVersion;
        // A later change by someone else makes the success message wrong; drop it.
        if (synced && member.platformRole !== notice.toRole) continue;
        notices[id] = { ...notice, synced };
      }
      return { versions: versionsOf(event.members), notices, session: rebaseSession(session, byId) };
    }
  }
}

function rebaseSession(session: RoleChangeSession | null, byId: Map<string, PlatformMember>): RoleChangeSession | null {
  if (!session) return null;
  const member = byId.get(session.memberId);
  // While saving, the action's result decides; a disappeared member is reported by the result.
  if (session.status === "saving") return session;
  if (!member) return null;
  const changed = member.roleVersion !== session.baseVersion;
  const stillAllowed = session.nextRole !== null && member.roleChange.assignableRoles.includes(session.nextRole);
  const blocked = session.status === "failed" && !session.failure?.retryable;
  if (!changed && !blocked) return stillAllowed ? session : { ...session, nextRole: onlyOption(member) };
  return {
    memberId: member.id,
    baseRole: member.platformRole,
    baseVersion: member.roleVersion,
    nextRole: changed ? onlyOption(member) : stillAllowed ? session.nextRole : onlyOption(member),
    status: "editing",
    failure: null,
    supersededFrom: changed ? session.baseRole : null,
  };
}
