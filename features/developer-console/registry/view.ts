/*
 * Presentation helpers for the Registry read-only mode.
 *
 * Ordering: list pages arrive in UUID order, which says nothing about time. Every list is ordered
 * here by an explicit field, and only within the rows loaded so far; the UI says so when more pages
 * exist. Content hashes are always the server's; nothing in this mode hashes in the browser.
 */
import type { Tone } from "@/features/platform/labels";
import type {
  DraftHeadRead, DraftRead, ProjectSummaryDTO, QualificationDTO, ReadError, ReadErrorCode, ReleaseRecordDTO, ReleaseRequestDTO, ReviewDTO, VersionRead,
} from "@/features/developer-console/registry/contract";
import { actionMeta } from "@/features/developer-console/permissions";
import { REGISTRY_ACTION_ROLES, type RegistryAction } from "@/features/registry/read-contracts";

const time = (value: string) => Date.parse(value);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const orderVersions = (items: readonly VersionRead[]) => [...items].sort((a, b) => time(b.createdAt) - time(a.createdAt) || byId(a, b));
export const orderReleases = (items: readonly ReleaseRecordDTO[]) => [...items].sort((a, b) => time(b.publishedAt) - time(a.publishedAt) || byId(a, b));
/** Requests carry no creation time; their fixed 15-minute deadline is the only time field. */
export const orderRequests = (items: readonly ReleaseRequestDTO[]) => [...items].sort((a, b) => time(b.expiresAt) - time(a.expiresAt) || byId(a, b));
export const orderReviews = (items: readonly ReviewDTO[]) => [...items].sort((a, b) => b.draftRevision - a.draftRevision || time(b.expiresAt) - time(a.expiresAt) || byId(a, b));
export const orderProjects = (items: readonly ProjectSummaryDTO[]) => [...items].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : byId(a, b)));
const actionOrder = Object.keys(REGISTRY_ACTION_ROLES);
export const orderQualifications = (items: readonly QualificationDTO[]) => [...items].sort((a, b) => actionOrder.indexOf(a.action) - actionOrder.indexOf(b.action));

/**
 * Draft head and DraftReadDTO are separate requests and not one snapshot. They describe the same
 * draft only when ID, revision, ETag and server hash all agree.
 */
export function draftAgreement(head: { data: DraftHeadRead | null; etag: string | null }, draft: { data: DraftRead | null; etag: string | null }) {
  if (!head.data || !draft.data) return "unknown" as const;
  return head.data.id === draft.data.id && head.data.revision === draft.data.revision && head.etag === draft.etag && head.data.contentHash === draft.data.contentHash
    ? "same" as const : "changed" as const;
}

/** Whether a review froze the content the current draft head has, by server hash and revision. */
export function reviewBinding(review: ReviewDTO, head: DraftHeadRead | null) {
  if (!head || head.contentHash === null || head.id !== review.draftId) return "unknown" as const;
  return review.contentHash === head.contentHash && review.draftRevision === head.revision ? "current" as const : "differs" as const;
}

const assetLabels: Record<"INGEST_ASSET" | "VERIFY_ASSET", string> = { INGEST_ASSET: "接收资产到隔离区", VERIFY_ASSET: "按实际字节验证资产" };
export function actionLabel(action: RegistryAction) {
  return action === "INGEST_ASSET" || action === "VERIFY_ASSET" ? assetLabels[action] : actionMeta[action].label;
}

/** Commands that change Registry state. None of them is available in this mode. */
export const WRITE_ACTIONS = [
  "EDIT_DRAFT", "SUBMIT_REVIEW", "WITHDRAW_REVIEW", "DECIDE_REVIEW", "SEAL_VERSION",
  "REQUEST_RELEASE", "APPROVE_RELEASE", "PUBLISH_RELEASE", "WITHDRAW_RELEASE", "ROLLBACK_RELEASE",
  "INGEST_ASSET", "VERIFY_ASSET",
] as const satisfies readonly RegistryAction[];

export type ReadScope = "draft" | "release" | "overview";

const scopeQualification: Record<ReadScope, string> = { draft: "READ_DRAFT", release: "READ_RELEASE", overview: "READ_DRAFT" };

export function readErrorText(error: ReadError, scope: ReadScope): { title: string; detail: string; tone: Tone } {
  const notSent = error.status === 0;
  const text: Record<ReadErrorCode, { title: string; detail: string; tone: Tone }> = {
    AUTH_REQUIRED: notSent
      ? { title: "没有可用的登录会话", detail: "当前浏览器没有有效会话，请求没有发送。重新登录后再读取。", tone: "danger" }
      : { title: "登录会话已失效", detail: "会话已登出、被撤销或已过期。服务端每次读取都在数据库中重新核对会话，不只看 JWT 是否过期。重新登录后再读取。", tone: "danger" },
    DISABLED: { title: "Registry 只读接口未开启", detail: "服务端的内部读取开关处于关闭状态（默认值）。这是服务端的真实状态，控制台不会改用 Mock 数据代替。", tone: "warning" },
    FORBIDDEN: scope === "release"
      ? { title: "没有 READ_RELEASE 读取资格", detail: "发布头、发布历史与发布申请需要单独授予且未到期的 READ_RELEASE 资格；它与 READ_DRAFT 互不替代，项目角色或管理员身份也不能代替。", tone: "danger" }
      : { title: `没有 ${scopeQualification[scope]} 读取资格`, detail: "读取项目、草稿、审核与版本需要单独授予且未到期的 READ_DRAFT 资格，以及有效的内部操作员身份；项目所有者或管理员身份不能代替。", tone: "danger" },
    NOT_FOUND: { title: "不存在，或你不是有效成员", detail: "项目或对象不存在、已归档、属于其他项目，或你不是这个项目的有效成员。服务端不区分这几种情况。", tone: "neutral" },
    METHOD_NOT_ALLOWED: { title: "方法不被允许", detail: "读取接口只接受 GET。", tone: "danger" },
    DRAFT_UNINITIALIZED: { title: "草稿尚未初始化", detail: "这是 B1 创建的空草稿，还没有经过一次合法编辑，因此没有可读取的 DraftDTO 和内容哈希。", tone: "neutral" },
    CONFLICT: { title: "读取冲突", detail: "数据库在读取期间检测到并发修改，有限次重试后仍然冲突。稍后重新读取。", tone: "warning" },
    REVIEW_INVALID: { title: "意外的状态码", detail: "读取接口返回了命令类冲突码 REVIEW_INVALID。控制台不显示这份结果。", tone: "warning" },
    HASH_MISMATCH: { title: "意外的状态码", detail: "读取接口返回了命令类冲突码 HASH_MISMATCH。控制台不显示这份结果。", tone: "warning" },
    APPROVAL_INVALID: { title: "意外的状态码", detail: "读取接口返回了命令类冲突码 APPROVAL_INVALID。控制台不显示这份结果。", tone: "warning" },
    INVALID_INPUT: notSent
      ? { title: "请求未发送", detail: "ID 或分页参数格式不正确，控制台没有发送这个请求。", tone: "danger" }
      : { title: "请求参数被拒绝", detail: "服务端拒绝了路径或查询参数。这通常是控制台的缺陷，请报告。", tone: "danger" },
    RATE_LIMITED: { title: "读取过于频繁", detail: "每个会话每分钟最多读取 60 次。等待结束前，控制台不会再发送请求。", tone: "warning" },
    UNAVAILABLE: { title: "服务暂不可用", detail: "依赖超时或失败、响应过大时，服务端一律拒绝。稍后重新读取。", tone: "warning" },
    NETWORK: { title: "没有收到响应", detail: "网络中断或请求超时，服务端没有返回结果。", tone: "warning" },
    CONTRACT_MISMATCH: { title: "响应不符合契约", detail: "响应包含未知字段、格式不符，或属于另一个项目或对象。控制台拒绝显示这份数据。", tone: "danger" },
  };
  return text[error.code];
}

export const statusText = (error: ReadError) => (error.status === 0 ? `未发送 · ${error.code}` : `${error.status} ${error.code}`);

/** Coarse remaining time for qualification deadlines, which can be hours or days away. */
export function formatExpiry(ms: number) {
  if (ms <= 0) return "已到期";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `剩 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `剩 ${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ""}`;
  return `剩 ${Math.floor(hours / 24)} 天`;
}

export const shortId = (id: string) => id.slice(0, 8);
export const shortDigest = (digest: string | null | undefined, size = 12) => (digest ? `${digest.slice(0, size)}…` : "—");
