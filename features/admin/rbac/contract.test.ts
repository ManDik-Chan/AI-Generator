import { describe, expect, it } from "vitest";

import {
  CLIENT_OUTCOME_CODES,
  interpretRoleChangeResult,
  parsePlatformDirectory,
  parseRoleAuditFeed,
  performRoleChange,
  ROLE_CHANGE_ERROR_CODES,
  type RoleChangeRequest,
} from "@/features/admin/rbac/contract";
import { describeRoleChange, isRetryableFailure, PLATFORM_ROLE_LABEL, roleChangeFailureCopy } from "@/features/admin/rbac/copy";
import { adminDirectory, auditFeed, FIXTURE_IDS, ownerDirectory, userViewer } from "@/tests/fixtures/admin-rbac";

const request: RoleChangeRequest = { profileId: FIXTURE_IDS.userC, expectedRole: "USER", expectedVersion: "v1-3c9f", nextRole: "ADMIN", requestId: "6f1d2c3b-4a59-4e68-9f70-8a1b2c3d4e5f" };

describe("platform directory contract", () => {
  it("accepts the owner and admin payloads", () => {
    expect(parsePlatformDirectory(ownerDirectory()).ok).toBe(true);
    expect(parsePlatformDirectory(adminDirectory()).ok).toBe(true);
  });

  it("strips fields outside the view model so they never reach client props", () => {
    const raw = ownerDirectory() as unknown as Record<string, unknown> & { viewer: Record<string, unknown>; members: Array<Record<string, unknown>> };
    raw.viewer.projectRoles = ["OWNER"];
    raw.viewer.accessToken = "eyJhbGciOi.secret";
    raw.members[3].passwordHash = "$2b$12$not-for-the-ui";
    raw.members[3].byokKey = "sk-live-not-for-the-ui";
    raw.members[3].lastConversation = "private chat text";
    const parsed = parsePlatformDirectory(raw);
    expect(parsed.ok).toBe(true);
    const json = JSON.stringify(parsed.ok && parsed.value);
    for (const secret of ["projectRoles", "eyJhbGciOi", "passwordHash", "sk-live", "private chat text"]) expect(json).not.toContain(secret);
  });

  it("keeps a project OWNER a platform USER with no capabilities", () => {
    const raw = { viewer: { ...userViewer, projectRoles: ["OWNER"], projectOwner: true }, members: [], totalMembers: 0 };
    const parsed = parsePlatformDirectory(raw);
    expect(parsed.ok && parsed.value.viewer).toEqual({ id: userViewer.id, platformRole: "USER", capabilities: { manageRoles: false, viewRoleAudit: false } });
  });

  it("rejects payloads whose authorization facts contradict themselves", () => {
    const withCurrentRole = ownerDirectory();
    withCurrentRole.members[1].roleChange.assignableRoles = ["ADMIN", "USER"];
    const restrictedButAssignable = ownerDirectory();
    restrictedButAssignable.members[3].roleChange.restriction = "PEER_ADMIN";
    const repeated = ownerDirectory();
    repeated.members[3].roleChange.assignableRoles = ["ADMIN", "ADMIN"];
    const wrongViewerFlag = ownerDirectory();
    wrongViewerFlag.members[3].isViewer = true;
    const duplicate = ownerDirectory();
    duplicate.members.push({ ...duplicate.members[0] });
    const unknownRole = ownerDirectory() as unknown as { members: Array<{ platformRole: string }> };
    unknownRole.members[0].platformRole = "SUPERADMIN";
    const undercounted = ownerDirectory();
    undercounted.totalMembers = 2;

    for (const payload of [withCurrentRole, restrictedButAssignable, repeated, wrongViewerFlag, duplicate, unknownRole, undercounted]) {
      const parsed = parsePlatformDirectory(payload);
      expect(parsed.ok).toBe(false);
      expect(parsed.ok ? [] : parsed.issues).not.toHaveLength(0);
    }
  });
});

describe("role change results", () => {
  it("accepts a success that names the requested member and role", () => {
    expect(interpretRoleChangeResult(request, { ok: true, changed: true, member: { id: FIXTURE_IDS.userC, platformRole: "ADMIN", roleVersion: "v2" } }))
      .toEqual({ ok: true, member: { id: FIXTURE_IDS.userC, platformRole: "ADMIN", roleVersion: "v2" } });
  });

  it("does not trust a success for a different member or role", () => {
    expect(interpretRoleChangeResult(request, { ok: true, changed: true, member: { id: FIXTURE_IDS.userD, platformRole: "ADMIN", roleVersion: "v2" } })).toEqual({ ok: false, code: "CONTRACT_MISMATCH" });
    expect(interpretRoleChangeResult(request, { ok: true, changed: true, member: { id: FIXTURE_IDS.userC, platformRole: "OWNER", roleVersion: "v2" } })).toEqual({ ok: false, code: "CONTRACT_MISMATCH" });
  });

  it("reads the final backend payloads (docs/handoffs/2026-11-02-platform-rbac-final-contract.md)", () => {
    const versioned: RoleChangeRequest = { ...request, expectedVersion: "3" };
    const member = { id: FIXTURE_IDS.userC, platformRole: "ADMIN", roleVersion: "4" } as const;
    // A first apply and an exact replay both confirm the member at the result version.
    expect(interpretRoleChangeResult(versioned, { ok: true, changed: true, member })).toEqual({ ok: true, member });
    expect(interpretRoleChangeResult(versioned, { ok: true, changed: false, member })).toEqual({ ok: true, member });
    // Failure details beyond the view model (version, protection reason) are dropped, not trusted.
    expect(interpretRoleChangeResult(versioned, { ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN", currentVersion: "5" })).toEqual({ ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN" });
    expect(interpretRoleChangeResult(versioned, { ok: false, code: "TARGET_PROTECTED", reason: "OWNER_PROTECTED" })).toEqual({ ok: false, code: "TARGET_PROTECTED" });
    for (const code of ["FORBIDDEN", "TARGET_NOT_FOUND", "INVALID_REQUEST", "UNAVAILABLE"] as const) {
      expect(interpretRoleChangeResult(versioned, { ok: false, code })).toEqual({ ok: false, code });
    }
  });

  it("does not trust a success without the changed flag or still at the request's base version", () => {
    const versioned: RoleChangeRequest = { ...request, expectedVersion: "3" };
    expect(interpretRoleChangeResult(versioned, { ok: true, member: { id: FIXTURE_IDS.userC, platformRole: "ADMIN", roleVersion: "4" } })).toEqual({ ok: false, code: "CONTRACT_MISMATCH" });
    for (const changed of [true, false]) {
      expect(interpretRoleChangeResult(versioned, { ok: true, changed, member: { id: FIXTURE_IDS.userC, platformRole: "ADMIN", roleVersion: "3" } })).toEqual({ ok: false, code: "CONTRACT_MISMATCH" });
    }
  });

  it("passes server error codes through with the server's current role", () => {
    for (const code of ROLE_CHANGE_ERROR_CODES) expect(interpretRoleChangeResult(request, { ok: false, code })).toEqual({ ok: false, code });
    expect(interpretRoleChangeResult(request, { ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN" })).toEqual({ ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN" });
    expect(interpretRoleChangeResult(request, { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 30 })).toEqual({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: 30 });
  });

  it("treats unknown or legacy shapes as an unconfirmed outcome instead of success", () => {
    for (const raw of [undefined, null, "ok", { ok: false, code: "TEAPOT" }, { status: "success", message: "已授予管理员角色。" }, { ok: true }, { ok: true, changed: true }]) {
      expect(interpretRoleChangeResult(request, raw)).toEqual({ ok: false, code: "CONTRACT_MISMATCH" });
    }
  });

  it("reports a thrown request as UNKNOWN_OUTCOME but lets framework redirects through", async () => {
    await expect(performRoleChange(async () => { throw new TypeError("fetch failed"); }, request)).resolves.toEqual({ ok: false, code: "UNKNOWN_OUTCOME" });
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(performRoleChange(async () => { throw redirect; }, request)).rejects.toBe(redirect);
    await expect(performRoleChange(async () => ({ ok: false, code: "FORBIDDEN" }), request)).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
  });
});

describe("role audit contract", () => {
  it("accepts available and unavailable feeds", () => {
    expect(parseRoleAuditFeed(auditFeed()).ok).toBe(true);
    expect(parseRoleAuditFeed({ status: "unavailable" })).toEqual({ ok: true, value: { status: "unavailable" } });
  });

  it("strips anything beyond who, whom, roles, time and outcome", () => {
    const raw = auditFeed() as unknown as { entries: Array<Record<string, unknown>> };
    raw.entries[0].ipAddress = "203.0.113.7";
    raw.entries[0].sessionToken = "sb-access-token";
    (raw.entries[0].target as Record<string, unknown>).password = "hunter2";
    const parsed = parseRoleAuditFeed(raw);
    const json = JSON.stringify(parsed.ok && parsed.value);
    for (const secret of ["203.0.113.7", "sb-access-token", "hunter2"]) expect(json).not.toContain(secret);
  });

  it("rejects unknown outcomes", () => {
    const raw = auditFeed() as unknown as { entries: Array<{ outcome: string }> };
    raw.entries[0].outcome = "MAYBE";
    expect(parseRoleAuditFeed(raw).ok).toBe(false);
  });
});

describe("role wording", () => {
  it("names platform roles so they cannot be confused with project roles", () => {
    expect(PLATFORM_ROLE_LABEL.OWNER).toBe("平台所有者");
    expect(PLATFORM_ROLE_LABEL.ADMIN).toBe("平台管理员");
    expect(PLATFORM_ROLE_LABEL.USER).toBe("普通用户");
  });

  it("has copy for every failure, and only client outcomes leave the result unknown", () => {
    for (const code of [...ROLE_CHANGE_ERROR_CODES, ...CLIENT_OUTCOME_CODES]) {
      const copy = roleChangeFailureCopy(code);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.nothingChanged).toBe(!(CLIENT_OUTCOME_CODES as readonly string[]).includes(code));
      if (copy.nothingChanged) expect(copy.body).toContain("没有更改任何权限");
    }
    expect(ROLE_CHANGE_ERROR_CODES.filter(isRetryableFailure)).toEqual(["RATE_LIMITED", "UNAVAILABLE"]);
    expect(roleChangeFailureCopy("UNAUTHENTICATED").recovery).toBe("login");
    expect(roleChangeFailureCopy("ROLE_CONFLICT", { currentRole: "ADMIN" }).body).toContain("这位用户现在是平台管理员");
  });

  it("describes the risk of each change direction", () => {
    expect(describeRoleChange("USER", "ADMIN")).toMatchObject({ confirmLabel: "确认授予管理员", tone: "elevate" });
    expect(describeRoleChange("ADMIN", "USER")).toMatchObject({ confirmLabel: "确认撤销管理员", tone: "reduce" });
    expect(describeRoleChange("ADMIN", "OWNER")).toMatchObject({ tone: "elevate" });
  });
});
