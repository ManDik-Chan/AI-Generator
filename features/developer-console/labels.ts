import type { Tone } from "@/features/platform/labels";
import type { ConsoleCommand, ConsoleVisibility, DraftState, ProtocolErrorCode, ReleaseRecordDTO, ReleaseRequestDTO, ReviewDTO } from "@/features/developer-console/model";

export const draftStateMeta: Record<DraftState, { label: string; tone: Tone; detail: string }> = {
  DRAFT: { label: "草稿", tone: "neutral", detail: "可编辑；每次保存 revision +1" },
  IN_REVIEW: { label: "审核中", tone: "warning", detail: "内容已冻结，等待独立审核" },
  // B1 enum value; it means "frozen into a Version", not "publicly released".
  PUBLISHED: { label: "已封存", tone: "info", detail: "已冻结为不可变 Version；不等于已公开发布" },
  ARCHIVED: { label: "已归档", tone: "neutral", detail: "终态" },
};

export const successText: Record<ConsoleCommand["action"], string> = {
  EDIT_DRAFT: "草稿已保存，revision +1",
  SUBMIT_REVIEW: "已提交审核：内容哈希与期限已冻结",
  WITHDRAW_REVIEW: "审核已撤回，草稿回到可编辑状态",
  DECIDE_REVIEW: "审核决定已记录",
  SEAL_VERSION: "已封存为不可变版本，草稿随之冻结",
  REQUEST_RELEASE: "发布申请已创建，等待独立批准",
  APPROVE_RELEASE: "已批准，等待原申请人执行",
  PUBLISH_RELEASE: "已发布：当前指针切换到新的 Release",
  ROLLBACK_RELEASE: "已回滚：用历史版本创建了新的 Release",
  WITHDRAW_RELEASE: "已追加撤回事实",
  START_DRAFT: "已开始新的草稿（Mock，契约缺口）",
};

export const reviewStateMeta: Record<ReviewDTO["effectiveState"], { label: string; tone: Tone }> = {
  PENDING: { label: "待审核", tone: "warning" },
  APPROVED: { label: "已批准", tone: "success" },
  REJECTED: { label: "已拒绝", tone: "danger" },
  INVALIDATED: { label: "已失效", tone: "neutral" },
  SEALED: { label: "已封存为版本", tone: "info" },
};

export const requestStateMeta: Record<ReleaseRequestDTO["state"], { label: string; tone: Tone }> = {
  PENDING: { label: "待批准", tone: "warning" },
  APPROVED: { label: "已批准，待执行", tone: "info" },
  CONSUMED: { label: "已执行", tone: "neutral" },
};

export function releaseStateMeta(release: ReleaseRecordDTO, currentId: string | null): { label: string; tone: Tone } {
  if (release.state === "WITHDRAWN") return { label: "已撤回", tone: "neutral" };
  return release.id === currentId ? { label: "当前发布", tone: "success" } : { label: "已被替换", tone: "neutral" };
}

export const visibilityLabels: Record<ConsoleVisibility, { label: string; tone: Tone }> = {
  PUBLIC: { label: "公开", tone: "success" },
  UNLISTED: { label: "不公开列出", tone: "info" },
  PRIVATE: { label: "私有", tone: "neutral" },
};

/** What each protocol error means for the person in front of the console. */
export const errorMeta: Record<ProtocolErrorCode, { title: string; detail: string }> = {
  AUTH_REQUIRED: { title: "需要有效会话", detail: "会话无效、已登出或已过期。服务端每次都重新核对会话，不只看 JWT 是否过期。" },
  FORBIDDEN: { title: "没有这项平台资格，或违反独立性", detail: "平台操作资格被撤销或已到期，或者你在审核自己的提交、批准自己的申请。" },
  NOT_FOUND: { title: "不存在，或你没有这项操作的角色", detail: "服务端不区分这两种情况，这样没有权限的人无法确认一个项目或记录是否存在。" },
  INVALID_INPUT: { title: "输入不符合严格契约", detail: "未知字段、格式错误、ETag 写法不对，或内容属于另一个项目。不会静默丢弃字段。" },
  PRECONDITION_REQUIRED: { title: "缺少 If-Match", detail: "每个写请求都必须携带上一次读取得到的强 ETag。" },
  PRECONDITION_FAILED: { title: "ETag 已过期", detail: "你读取之后，草稿或发布头被修改过。载入最新内容再操作，不会覆盖别人的修改。" },
  IDEMPOTENCY_CONFLICT: { title: "幂等键被用于不同的请求", detail: "同一个 Idempotency-Key 只能对应同一个动作和同一份请求体。" },
  REPLAY_STALE: { title: "重放的回执已过时", detail: "授权 epoch 变了、审核已失效或发布已被替换。旧回执不能当作新的授权。" },
  REVIEW_INVALID: { title: "审核已失效", detail: "已过期（15 分钟）、被撤回、草稿被改动、授权 epoch 变化，或审核尚未批准。" },
  HASH_MISMATCH: { title: "内容哈希不一致", detail: "你提交的 expectedContentHash 与服务端当前内容不符。" },
  CONFLICT: { title: "当前状态不允许", detail: "例如草稿已在审核中、记录已被处理，或版本号已被封存过。" },
  DRAFT_UNINITIALIZED: { title: "草稿尚未初始化", detail: "B1 创建的空草稿必须先经过一次合法编辑，才能读取完整 DraftDTO 或提交。" },
  DISABLED: { title: "功能未开启", detail: "Registry 内部开关默认关闭。" },
  UNAVAILABLE: { title: "服务暂不可用", detail: "依赖超时或失败；所有检查失败时一律拒绝。" },
  APPROVAL_INVALID: { title: "发布批准无效", detail: "批准已过期、发布头已变化、意图不符，或执行人不是原申请人。（暂定契约）" },
};

const pad = (value: number) => String(value).padStart(2, "0");

/** Fixed UTC+8 so the server and every browser print the same text. */
export function formatClock(value: number | string) {
  const date = new Date(typeof value === "string" ? Date.parse(value) : value);
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

export function formatRemaining(ms: number) {
  if (ms <= 0) return "已过期";
  const total = Math.ceil(ms / 1000);
  return `剩 ${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function bumpMinor(version: string | null | undefined) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "");
  return match ? `${match[1]}.${Number(match[2]) + 1}.0` : "0.1.0";
}
