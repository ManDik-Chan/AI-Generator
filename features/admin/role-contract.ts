import { z } from "zod";

export const PLATFORM_ROLE_LABELS = { OWNER: "平台所有者", ADMIN: "管理员", USER: "普通用户" } as const;
export type PlatformRole = keyof typeof PLATFORM_ROLE_LABELS;
export type ManagedRole = "ADMIN" | "USER";
export const roleChangeInputSchema = z.object({
  profileId: z.string().uuid(),
  nextRole: z.enum(["ADMIN", "USER"]),
  expectedRole: z.enum(["ADMIN", "USER"]),
  // Canonical decimal form avoids accepting multiple representations of one version.
  expectedVersion: z.string().regex(/^(0|[1-9]\d{0,9})$/).refine((value) => Number(value) <= 2147483647),
  requestId: z.string().uuid(),
}).strict();
export type RoleChangeErrorCode = "INVALID_REQUEST" | "FORBIDDEN" | "TARGET_PROTECTED" | "TARGET_NOT_FOUND" | "ROLE_CONFLICT" | "UNAVAILABLE";

export type RoleChangeDecision = { allowed: true } | { allowed: false; code: "SELF_CHANGE" | "OWNER_PROTECTED" | "FORBIDDEN"; reason: string };

/** Advisory UI contract; every mutation repeats this check against locked database rows. */
export function canChangePlatformRole(actor: PlatformRole, target: PlatformRole, self: boolean): RoleChangeDecision {
  if (self) return { allowed: false, code: "SELF_CHANGE", reason: "不能修改自己的平台角色。" };
  if (target === "OWNER") return { allowed: false, code: "OWNER_PROTECTED", reason: "平台所有者身份须通过独立安全流程转移。" };
  if (actor !== "OWNER") return { allowed: false, code: "FORBIDDEN", reason: "只有平台所有者可以变更平台角色。" };
  return { allowed: true };
}

export function platformCapabilities(role: PlatformRole) {
  return { canAccessAdmin: role === "OWNER" || role === "ADMIN", canManageAdminRoles: role === "OWNER" };
}

export interface RoleAuditView {
  actorId: string;
  targetId: string;
  oldRole: PlatformRole;
  newRole: PlatformRole;
  requestId: string;
  createdAt: Date;
}
