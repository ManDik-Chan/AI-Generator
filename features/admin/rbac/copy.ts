import type { PlatformRole, PlatformViewer, RoleChangeFailureCode, RoleRestriction } from "@/features/admin/rbac/contract";

/*
 * Wording for the platform-role screens. Platform roles are always named with the 平台 prefix
 * (平台所有者 / 平台管理员) so they cannot be read as the project roles of the developer
 * console, which are named 项目所有者 etc. Nothing here decides a permission.
 */

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  OWNER: "平台所有者",
  ADMIN: "平台管理员",
  USER: "普通用户",
};

export const PLATFORM_ROLE_SUMMARY: Record<PlatformRole, string> = {
  OWNER: "平台的最终负责人：任免平台管理员，并查看角色变更记录。",
  ADMIN: "负责日常运营：查看用户、运行与系统状态。任免管理员和调整其他管理员由平台所有者负责。",
  USER: "使用工作区与工具，没有系统管理入口。",
};

export const PLATFORM_VS_PROJECT_NOTE = "平台角色只决定能否进入系统管理。项目中的「项目所有者」等角色只在该项目内有效，不会带来平台管理权限。";

/** Which server endpoints this page actually has wired. A capability without one cannot be used yet. */
export interface ViewerConnections {
  roleChanges: boolean;
  roleAudit: boolean;
}

export function viewerCapabilityLines(viewer: PlatformViewer, connected: ViewerConnections = { roleChanges: true, roleAudit: true }) {
  const { manageRoles, viewRoleAudit } = viewer.capabilities;
  return [
    {
      key: "manageRoles",
      allowed: manageRoles && connected.roleChanges,
      label: !manageRoles ? "不能调整平台角色" : connected.roleChanges ? "可以调整平台角色，每位用户可做的调整以该行显示为准" : "有权调整平台角色，但角色调整入口暂未接入",
    },
    {
      key: "viewRoleAudit",
      allowed: viewRoleAudit && connected.roleAudit,
      label: !connected.roleAudit ? "角色变更记录暂未接入" : viewRoleAudit ? "可以查看角色变更记录" : "不能查看角色变更记录",
    },
  ] as const;
}

/** `short` is shown on the row; `detail` explains it to screen readers and in the dialog. */
export const RESTRICTION_COPY: Record<RoleRestriction, { short: string; detail: string }> = {
  SELF: { short: "不能修改自己的角色", detail: "平台角色不能由本人修改。" },
  OWNER_PROTECTED: { short: "所有者角色受保护", detail: "平台所有者的角色不能在这里调整。" },
  PEER_ADMIN: { short: "仅平台所有者可调整", detail: "管理员之间不能互相调整角色或账户状态；如需调整，请联系平台所有者。" },
  INSUFFICIENT_ROLE: { short: "无权调整", detail: "你的平台角色不能调整这位用户。" },
};

/**
 * Restrictions worth repeating on each row. INSUFFICIENT_ROLE is only shown per row when the
 * viewer can manage some roles; otherwise the viewer card already says so once.
 */
export function rowRestrictionVisible(restriction: RoleRestriction | null, viewer: PlatformViewer): restriction is RoleRestriction {
  if (!restriction) return false;
  return restriction !== "INSUFFICIENT_ROLE" || viewer.capabilities.manageRoles;
}

export type FailureRecovery = "retry" | "refresh" | "login";

export interface FailureCopy {
  title: string;
  body: string;
  recovery: FailureRecovery;
  /** False for client-side outcomes where the change may have applied. */
  nothingChanged: boolean;
}

export function roleChangeFailureCopy(code: RoleChangeFailureCode, details: { currentRole?: PlatformRole; retryAfterSeconds?: number } = {}): FailureCopy {
  switch (code) {
    case "UNAUTHENTICATED":
      return { title: "登录已过期", body: "没有更改任何权限。请重新登录后再确认这项调整。", recovery: "login", nothingChanged: true };
    case "FORBIDDEN":
      return { title: "你的权限已变化", body: "服务端拒绝了这项操作，你的平台角色可能刚被调整。没有更改任何权限。", recovery: "refresh", nothingChanged: true };
    case "TARGET_PROTECTED":
      return { title: "这位用户受保护", body: "服务端拒绝调整这位用户的平台角色。没有更改任何权限。", recovery: "refresh", nothingChanged: true };
    case "ROLE_CONFLICT":
      return {
        title: "角色已被他人修改",
        body: `${details.currentRole ? `这位用户现在是${PLATFORM_ROLE_LABEL[details.currentRole]}。` : "这位用户的角色在你确认前已经变化。"}为避免覆盖他人的操作，服务端没有执行本次调整，没有更改任何权限。请查看最新状态后再决定。`,
        recovery: "refresh",
        nothingChanged: true,
      };
    case "TARGET_NOT_FOUND":
      return { title: "用户已不存在", body: "这位用户不存在或已被删除。没有更改任何权限。", recovery: "refresh", nothingChanged: true };
    case "INVALID_REQUEST":
      return { title: "请求无效", body: "没有更改任何权限。请刷新页面后重试。", recovery: "refresh", nothingChanged: true };
    case "RATE_LIMITED":
      return { title: "操作过于频繁", body: `没有更改任何权限。${details.retryAfterSeconds ? `请约 ${details.retryAfterSeconds} 秒后再试。` : "请稍后再试。"}`, recovery: "retry", nothingChanged: true };
    case "UNAVAILABLE":
      return { title: "暂时无法保存", body: "角色更新失败，没有更改任何权限。可以稍后重试。", recovery: "retry", nothingChanged: true };
    case "CONTRACT_MISMATCH":
      return { title: "无法确认结果", body: "服务端返回了无法识别的结果，界面不会推测调整是否生效。请刷新查看实际角色。", recovery: "refresh", nothingChanged: false };
    case "UNKNOWN_OUTCOME":
      return { title: "无法确认结果", body: "请求中断，无法确认调整是否生效。请刷新查看实际角色，不要重复提交。", recovery: "refresh", nothingChanged: false };
  }
}

/** Retryable failures keep the dialog usable; every other failure locks the row until fresh data arrives. */
export const isRetryableFailure = (code: RoleChangeFailureCode) => roleChangeFailureCopy(code).recovery === "retry";

const ROLE_RANK: Record<PlatformRole, number> = { USER: 0, ADMIN: 1, OWNER: 2 };

export interface RoleChangeDescription {
  /** Short verb phrase for the audit log and success messages. */
  verb: string;
  confirmLabel: string;
  /** What changes for the member, shown before confirming. */
  consequence: string;
  tone: "elevate" | "reduce";
}

export function describeRoleChange(from: PlatformRole, to: PlatformRole): RoleChangeDescription {
  if (to === "OWNER") {
    return { verb: "设为平台所有者", confirmLabel: "确认设为平台所有者", consequence: "对方将成为平台所有者，获得任免平台管理员和查看角色变更记录的权限。", tone: "elevate" };
  }
  if (from === "USER" && to === "ADMIN") {
    return { verb: "授予平台管理员", confirmLabel: "确认授予管理员", consequence: "对方将进入系统管理，可以查看全部用户、运行与系统状态。", tone: "elevate" };
  }
  if (from === "ADMIN" && to === "USER") {
    return { verb: "撤销平台管理员", confirmLabel: "确认撤销管理员", consequence: "对方将立即失去系统管理入口；之后提交的管理操作会被服务端拒绝。", tone: "reduce" };
  }
  const tone = ROLE_RANK[to] > ROLE_RANK[from] ? "elevate" : "reduce";
  return {
    verb: `调整为${PLATFORM_ROLE_LABEL[to]}`,
    confirmLabel: `确认调整为${PLATFORM_ROLE_LABEL[to]}`,
    consequence: tone === "reduce" ? `对方将不再是${PLATFORM_ROLE_LABEL[from]}，相应的管理权限会立即失效。` : `对方将成为${PLATFORM_ROLE_LABEL[to]}。`,
    tone,
  };
}

export const memberName = (member: { displayName: string | null; email: string }) => member.displayName?.trim() || member.email;

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

/** Fixed time zone so server and client render the same text (no hydration mismatch). */
export const formatAdminDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
export const formatAdminDate = (iso: string) => dateFormat.format(new Date(iso));
