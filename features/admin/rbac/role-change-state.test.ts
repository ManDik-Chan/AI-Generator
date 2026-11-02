import { describe, expect, it } from "vitest";

import type { PlatformMember } from "@/features/admin/rbac/contract";
import {
  buildRoleChangeRequest,
  canSubmit,
  directoryReducer,
  displayedRole,
  initialDirectoryState,
  isRowLocked,
  type DirectoryEvent,
  type DirectoryState,
} from "@/features/admin/rbac/role-change-state";
import { FIXTURE_IDS, ownerDirectory } from "@/tests/fixtures/admin-rbac";

const run = (state: DirectoryState, ...events: DirectoryEvent[]) => events.reduce(directoryReducer, state);
const REQUEST_A = "6f1d2c3b-4a59-4e68-9f70-8a1b2c3d4e5f";
const REQUEST_B = "7a2e3d4c-5b6a-4f79-8081-9b2c3d4e5f60";
const submit: DirectoryEvent = { type: "submit", requestId: REQUEST_A };

function setup() {
  const members = ownerDirectory().members;
  const userC = members.find((member) => member.id === FIXTURE_IDS.userC)!;
  const owner = members.find((member) => member.id === FIXTURE_IDS.owner)!;
  return { members, userC, owner, state: initialDirectoryState(members) };
}

/** The same members after the server re-rendered, with one member replaced. */
const withMember = (members: PlatformMember[], next: PlatformMember) => members.map((member) => (member.id === next.id ? next : member));

describe("opening and choosing", () => {
  it("preselects the only offered role and builds a request with the role and version the viewer saw", () => {
    const { userC, state } = setup();
    const opened = run(state, { type: "open", member: userC });
    expect(opened.session).toMatchObject({ memberId: userC.id, baseRole: "USER", nextRole: "ADMIN", requestId: null, status: "editing" });
    // No request exists before the submit event assigns the idempotency key.
    expect(buildRoleChangeRequest(opened.session!)).toBeNull();
    const saving = run(opened, submit);
    expect(buildRoleChangeRequest(saving.session!)).toEqual({ profileId: userC.id, expectedRole: "USER", expectedVersion: userC.roleVersion, nextRole: "ADMIN", requestId: REQUEST_A });
  });

  it("never opens a member without a server roleVersion", () => {
    const { userC, state } = setup();
    expect(run(state, { type: "open", member: { ...userC, roleVersion: null } }).session).toBeNull();
  });

  it("offers nothing for a member the server protects", () => {
    const { owner, state } = setup();
    expect(run(state, { type: "open", member: owner }).session).toBeNull();
  });

  it("does not close, reselect or resubmit while saving", () => {
    const { userC, state } = setup();
    const saving = run(state, { type: "open", member: userC }, submit);
    expect(saving.session?.status).toBe("saving");
    expect(run(saving, { type: "close" })).toBe(saving);
    expect(run(saving, submit)).toBe(saving);
    expect(run(saving, { type: "select", role: "OWNER" })).toBe(saving);
    expect(canSubmit(saving.session)).toBe(false);
  });
});

describe("after a successful change", () => {
  it("shows the confirmed role and locks the row until the server sends the new version", () => {
    const { members, userC, state } = setup();
    const applied = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: true, member: { id: userC.id, platformRole: "ADMIN", roleVersion: "v2" } } });
    expect(applied.session).toBeNull();
    expect(displayedRole(userC, applied.notices[userC.id])).toBe("ADMIN");
    expect(isRowLocked(applied.notices[userC.id])).toBe(true);
    // Reopening with the stale row is refused: its assignable roles describe the old role.
    expect(run(applied, { type: "open", member: userC }).session).toBeNull();

    const stillStale = run(applied, { type: "serverData", members: [...members] });
    expect(isRowLocked(stillStale.notices[userC.id])).toBe(true);

    const fresh = { ...userC, platformRole: "ADMIN" as const, roleVersion: "v2", roleChange: { assignableRoles: ["USER" as const], restriction: null } };
    const synced = run(applied, { type: "serverData", members: withMember(members, fresh) });
    expect(synced.notices[userC.id]).toMatchObject({ kind: "applied", synced: true, toRole: "ADMIN" });
    expect(isRowLocked(synced.notices[userC.id])).toBe(false);
    expect(displayedRole(fresh, synced.notices[userC.id])).toBe("ADMIN");
  });

  it("counts the row as synced when fresh data arrived before the action resolved", () => {
    const { members, userC, state } = setup();
    const fresh = { ...userC, platformRole: "ADMIN" as const, roleVersion: "v2", roleChange: { assignableRoles: ["USER" as const], restriction: null } };
    const result = run(state, { type: "open", member: userC }, submit, { type: "serverData", members: withMember(members, fresh) }, { type: "resolved", outcome: { ok: true, member: { id: userC.id, platformRole: "ADMIN", roleVersion: "v2" } } });
    expect(isRowLocked(result.notices[userC.id])).toBe(false);
  });

  it("drops the success message once someone else changes the member again", () => {
    const { members, userC, state } = setup();
    const applied = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: true, member: { id: userC.id, platformRole: "ADMIN", roleVersion: "v2" } } });
    const changedAgain = { ...userC, platformRole: "USER" as const, roleVersion: "v3" };
    expect(run(applied, { type: "serverData", members: withMember(members, changedAgain) }).notices[userC.id]).toBeUndefined();
  });
});

describe("after a rejection", () => {
  it("locks the row on a conflict and re-bases on the fresh member after refresh", () => {
    const { members, userC, state } = setup();
    const conflict = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN" } });
    expect(conflict.session).toMatchObject({ status: "failed", failure: { code: "ROLE_CONFLICT", currentRole: "ADMIN", retryable: false } });
    expect(isRowLocked(conflict.notices[userC.id])).toBe(true);
    expect(canSubmit(conflict.session)).toBe(false);
    expect(run(conflict, { type: "select", role: "ADMIN" })).toBe(conflict);
    expect(run(conflict, submit)).toBe(conflict);

    const fresh = { ...userC, platformRole: "ADMIN" as const, roleVersion: "v9", roleChange: { assignableRoles: ["USER" as const], restriction: null } };
    const refreshed = run(conflict, { type: "serverData", members: withMember(members, fresh) });
    expect(isRowLocked(refreshed.notices[userC.id])).toBe(false);
    expect(refreshed.notices[userC.id]).toMatchObject({ kind: "rejected", code: "ROLE_CONFLICT" });
    expect(refreshed.session).toMatchObject({ baseRole: "ADMIN", baseVersion: "v9", nextRole: "USER", status: "editing", failure: null, supersededFrom: "USER" });
  });

  it("after FORBIDDEN, follows the fresh assignable roles even when the member did not change", () => {
    const { members, userC, state } = setup();
    const forbidden = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: false, code: "FORBIDDEN" } });
    expect(isRowLocked(forbidden.notices[userC.id])).toBe(true);
    const demotedView = { ...userC, roleChange: { assignableRoles: [], restriction: "INSUFFICIENT_ROLE" as const } };
    const refreshed = run(forbidden, { type: "serverData", members: withMember(members, demotedView) });
    expect(refreshed.session).toMatchObject({ nextRole: null, status: "editing", failure: null, supersededFrom: null });
    expect(canSubmit(refreshed.session)).toBe(false);
  });

  it("keeps the dialog usable for retryable failures", () => {
    const { userC, state } = setup();
    const unavailable = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: false, code: "UNAVAILABLE" } });
    expect(unavailable.session).toMatchObject({ status: "failed", failure: { retryable: true } });
    expect(unavailable.notices[userC.id]).toBeUndefined();
    expect(canSubmit(unavailable.session)).toBe(true);
    expect(run(unavailable, submit).session?.status).toBe("saving");
  });

  it("locks the row when the outcome cannot be confirmed", () => {
    const { userC, state } = setup();
    for (const code of ["UNKNOWN_OUTCOME", "CONTRACT_MISMATCH", "UNAUTHENTICATED", "TARGET_NOT_FOUND", "TARGET_PROTECTED", "INVALID_REQUEST"] as const) {
      const result = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: false, code } });
      expect(isRowLocked(result.notices[userC.id])).toBe(true);
      expect(canSubmit(result.session)).toBe(false);
    }
  });
});

describe("request idempotency key", () => {
  it("keeps one requestId across retries of the same intent", () => {
    const { userC, state } = setup();
    const failed = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: false, code: "UNAVAILABLE" } });
    expect(failed.session?.requestId).toBe(REQUEST_A);
    const retried = run(failed, { type: "submit", requestId: REQUEST_B });
    expect(buildRoleChangeRequest(retried.session!)?.requestId).toBe(REQUEST_A);
    // Re-selecting the same role is still the same intent.
    expect(run(failed, { type: "select", role: "ADMIN" }).session?.requestId).toBe(REQUEST_A);
  });

  it("starts a new intent when the choice changes", () => {
    const { members, state } = setup();
    const adminA = members.find((member) => member.id === FIXTURE_IDS.adminA)!;
    const twoOptions = { ...adminA, roleChange: { assignableRoles: ["USER" as const, "OWNER" as const], restriction: null } };
    const failed = run(state, { type: "open", member: twoOptions }, { type: "select", role: "USER" }, submit, { type: "resolved", outcome: { ok: false, code: "RATE_LIMITED" } });
    expect(failed.session?.requestId).toBe(REQUEST_A);
    const switched = run(failed, { type: "select", role: "OWNER" });
    expect(switched.session?.requestId).toBeNull();
    expect(buildRoleChangeRequest(run(switched, { type: "submit", requestId: REQUEST_B }).session!)?.requestId).toBe(REQUEST_B);
  });

  it("drops the key when fresh data re-bases the dialog on a changed member", () => {
    const { members, userC, state } = setup();
    const failed = run(state, { type: "open", member: userC }, submit, { type: "resolved", outcome: { ok: false, code: "ROLE_CONFLICT" } });
    const changed = { ...userC, roleVersion: "v8" };
    expect(run(failed, { type: "serverData", members: withMember(members, changed) }).session?.requestId).toBeNull();
  });
});

describe("server data arriving under an open dialog", () => {
  it("drops the pending choice when the member changed", () => {
    const { members, userC, state } = setup();
    const editing = run(state, { type: "open", member: userC });
    const promoted = { ...userC, platformRole: "ADMIN" as const, roleVersion: "v5", roleChange: { assignableRoles: [], restriction: "PEER_ADMIN" as const } };
    const result = run(editing, { type: "serverData", members: withMember(members, promoted) });
    expect(result.session).toMatchObject({ baseRole: "ADMIN", baseVersion: "v5", nextRole: null, supersededFrom: "USER" });
    expect(canSubmit(result.session)).toBe(false);
  });

  it("clears a choice the server no longer offers", () => {
    const { members, userC, state } = setup();
    const editing = run(state, { type: "open", member: userC });
    const narrowed = { ...userC, roleChange: { assignableRoles: [], restriction: "INSUFFICIENT_ROLE" as const } };
    expect(run(editing, { type: "serverData", members: withMember(members, narrowed) }).session?.nextRole).toBeNull();
  });

  it("closes the dialog when fresh data no longer carries a roleVersion", () => {
    const { members, userC, state } = setup();
    const editing = run(state, { type: "open", member: userC });
    const unversioned = { ...userC, roleVersion: null, roleChange: { assignableRoles: [], restriction: null } };
    expect(run(editing, { type: "serverData", members: withMember(members, unversioned) }).session).toBeNull();
  });

  it("leaves a saving request alone and closes the dialog for a member who is gone", () => {
    const { members, userC, state } = setup();
    const saving = run(state, { type: "open", member: userC }, submit);
    const gone = members.filter((member) => member.id !== userC.id);
    expect(run(saving, { type: "serverData", members: gone }).session).toBe(saving.session);
    expect(run(state, { type: "open", member: userC }, { type: "serverData", members: gone }).session).toBeNull();
  });
});
