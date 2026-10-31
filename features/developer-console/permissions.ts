/*
 * Who may do what. Three independent gates decide every Registry command:
 *
 *   1. a verified, unexpired Auth session (no JWT role or metadata counts),
 *   2. a separately granted, unexpired internal operator qualification for that action,
 *   3. an active project membership with one of the action's roles.
 *
 * DRAFT_ROLES mirrors the private `roles` map in features/registry/protocol.ts; a unit test
 * reads that file and fails when they diverge. RELEASE_ROLES follows the unmerged P1-B2-B
 * draft contract and is marked provisional everywhere it is shown.
 */
import type { ConsoleAction, ConsoleRole, DraftAction, ReleaseAction } from "@/features/developer-console/model";

export const DRAFT_ROLES: Record<DraftAction, readonly ConsoleRole[]> = {
  READ_DRAFT: ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"],
  EDIT_DRAFT: ["OWNER", "EDITOR"],
  SUBMIT_REVIEW: ["OWNER", "EDITOR"],
  WITHDRAW_REVIEW: ["OWNER", "EDITOR"],
  DECIDE_REVIEW: ["REVIEWER"],
  SEAL_VERSION: ["OWNER", "EDITOR"],
};

/** PROVISIONAL — docs/registry-b2b-release-contracts.md on the unmerged B2-B branch. */
export const RELEASE_ROLES: Record<ReleaseAction, readonly ConsoleRole[]> = {
  READ_RELEASE: ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"],
  REQUEST_RELEASE: ["OWNER", "PUBLISHER"],
  APPROVE_RELEASE: ["REVIEWER"],
  PUBLISH_RELEASE: ["OWNER", "PUBLISHER"],
  WITHDRAW_RELEASE: ["OWNER", "PUBLISHER"],
  ROLLBACK_RELEASE: ["OWNER", "PUBLISHER"],
};

/** Mock-only: no contract defines who may start the next draft. Assumed OWNER / EDITOR. */
export const GAP_ROLES: Record<"START_DRAFT", readonly ConsoleRole[]> = { START_DRAFT: ["OWNER", "EDITOR"] };

export const ACTION_ROLES: Record<ConsoleAction, readonly ConsoleRole[]> = { ...DRAFT_ROLES, ...RELEASE_ROLES, ...GAP_ROLES };

export type ContractStatus = "merged" | "provisional" | "gap";

export interface ActionMeta {
  label: string;
  detail: string;
  contract: ContractStatus;
  /** Extra rule beyond the role check, shown next to the matrix. */
  independence?: string;
}

export const actionMeta: Record<ConsoleAction, ActionMeta> = {
  READ_DRAFT: { label: "读取草稿与审核", detail: "Draft 头、DraftDTO、Review 及其当前有效性", contract: "merged" },
  EDIT_DRAFT: { label: "编辑草稿", detail: "整份 payload 替换；必须携带当前 ETag", contract: "merged" },
  SUBMIT_REVIEW: { label: "提交审核", detail: "冻结内容哈希、资产摘要、epoch 与 15 分钟期限", contract: "merged" },
  WITHDRAW_REVIEW: { label: "撤回审核", detail: "让审核失效并回到可编辑草稿；已作出的决定不被改写", contract: "merged" },
  DECIDE_REVIEW: { label: "审核决定", detail: "批准或拒绝", contract: "merged", independence: "审核人不能是提交人" },
  SEAL_VERSION: { label: "封存版本", detail: "把已批准的内容封存为不可变 Version；草稿随之冻结", contract: "merged" },
  READ_RELEASE: { label: "读取发布头", detail: "当前 Release 指针与发布 ETag", contract: "provisional" },
  REQUEST_RELEASE: { label: "申请发布", detail: "绑定 Version、实际哈希、目标可见性与当前发布头", contract: "provisional" },
  APPROVE_RELEASE: { label: "批准发布", detail: "为一次发布申请追加独立批准", contract: "provisional", independence: "批准人不能是申请人" },
  PUBLISH_RELEASE: { label: "发布", detail: "消费批准，创建新 Release 并切换当前指针", contract: "provisional", independence: "必须由原申请人执行" },
  WITHDRAW_RELEASE: { label: "撤回发布", detail: "追加撤回事实；撤回当前 Release 时项目回到私有", contract: "provisional" },
  ROLLBACK_RELEASE: { label: "回滚", detail: "用历史 Release 的不可变 Version 创建全新的 Release", contract: "provisional", independence: "需要独立批准，且由原申请人执行" },
  START_DRAFT: { label: "开始下一版草稿", detail: "封存后从某个 Version 复制出新草稿", contract: "gap" },
};

export const roleLabels: Record<ConsoleRole, string> = {
  OWNER: "所有者",
  EDITOR: "编辑",
  REVIEWER: "审核",
  PUBLISHER: "发布",
  VIEWER: "只读",
};

export const contractMeta: Record<ContractStatus, { label: string; detail: string }> = {
  merged: { label: "已合并契约", detail: "main 上的 features/registry/protocol.ts，内部库，无 HTTP 路由" },
  provisional: { label: "暂定契约", detail: "P1-B2-B 尚未合并，按其草案模拟，合并后需复核" },
  gap: { label: "契约缺口", detail: "目前没有任何接口，仅在 Mock 中提供，已列入交接文档的契约需求" },
};

export function rolesAllow(roles: readonly ConsoleRole[], action: ConsoleAction) {
  return roles.some((role) => ACTION_ROLES[action].includes(role));
}

/** Roles that would allow `action`, for "needs X" hints. */
export function requiredRoles(action: ConsoleAction) {
  return ACTION_ROLES[action];
}
