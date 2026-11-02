import { describe, expect, it } from "vitest";
import { canChangePlatformRole, platformCapabilities, roleChangeInputSchema, type PlatformRole } from "./role-contract";

describe("platform roles", () => {
  const roles: PlatformRole[] = ["OWNER", "ADMIN", "USER"];
  it("grants operational access only to OWNER and ADMIN", () => {
    expect(roles.map((role) => platformCapabilities(role).canAccessAdmin)).toEqual([true, true, false]);
    expect(roles.map((role) => platformCapabilities(role).canManageAdminRoles)).toEqual([true, false, false]);
  });
  it("requires a valid request id and observed role, and never accepts OWNER as a requested role", () => {
    const valid = { profileId: "d525801a-3c45-4419-93a5-3f62221e0951", requestId: "d525801a-3c45-4419-93a5-3f62221e0952", expectedRole: "USER", role: "ADMIN" };
    expect(roleChangeInputSchema.safeParse(valid).success).toBe(true);
    expect(roleChangeInputSchema.safeParse({ ...valid, requestId: undefined }).success).toBe(false);
    expect(roleChangeInputSchema.safeParse({ ...valid, expectedRole: undefined }).success).toBe(false);
    expect(roleChangeInputSchema.safeParse({ ...valid, profileId: "invalid" }).success).toBe(false);
    expect(roleChangeInputSchema.safeParse({ ...valid, role: "OWNER" }).success).toBe(false);
  });
  it("allows only OWNER to change another USER or ADMIN", () => {
    for (const actor of roles) for (const target of roles) {
      expect(canChangePlatformRole(actor, target, false).allowed).toBe(actor === "OWNER" && target !== "OWNER");
      expect(canChangePlatformRole(actor, target, true).allowed).toBe(false);
    }
  });
});

