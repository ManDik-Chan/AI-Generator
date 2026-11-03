/*
 * Presentation helpers for the two Registry writes: who may edit, and what each answer means.
 */
import type { Tone } from "@/features/platform/labels";
import type { ProjectReadDTO, ReadError } from "@/features/developer-console/registry/contract";
import type { DraftState } from "@/features/developer-console/registry/draft-editor";
import type { UnknownReason, WriteError } from "@/features/developer-console/registry/write-contract";

export type EditAccess =
  | { kind: "editable"; expiresAt: string }
  /** The project could not be read: access is unknown and editing is not offered. */
  | { kind: "unknown"; error: ReadError | null }
  /** OWNER or EDITOR, but no live EDIT_DRAFT grant. */
  | { kind: "no-grant" }
  /** No OWNER or EDITOR role in this project. */
  | { kind: "no-role" }
  /** The draft is frozen in review, sealed or archived. */
  | { kind: "state"; state: DraftState };

/**
 * Editing is offered only on the server's own answer: EDIT_DRAFT in the project's effectiveActions
 * (a live grant intersected with an OWNER/EDITOR role), unexpired by this clock, and a DRAFT state.
 * The server still checks everything again on save.
 */
export function editAccess(project: ProjectReadDTO | null, projectError: ReadError | null, state: DraftState | null, now: number): EditAccess {
  if (!project) return { kind: "unknown", error: projectError };
  const grant = project.effectiveActions.find((item) => item.action === "EDIT_DRAFT");
  if (!grant || Date.parse(grant.expiresAt) <= now) {
    return project.roles.some((role) => role === "OWNER" || role === "EDITOR") ? { kind: "no-grant" } : { kind: "no-role" };
  }
  if (state !== null && state !== "DRAFT") return { kind: "state", state };
  return { kind: "editable", expiresAt: grant.expiresAt };
}

export function editAccessText(access: Exclude<EditAccess, { kind: "editable" }>): { title: string; detail: string } {
  switch (access.kind) {
    case "unknown":
      return { title: "编辑资格未知", detail: "没有读取到项目与你在本项目的有效资格，控制台不猜测你有编辑权限。重新读取后再试。" };
    case "no-grant":
      return { title: "没有 EDIT_DRAFT 资格", detail: "你是本项目的所有者或编辑者，但没有单独授予且未到期的 EDIT_DRAFT 平台资格。项目所有者不会自动获得这项资格；需要由平台操作员单独授予。" };
    case "no-role":
      return { title: "你在本项目没有编辑角色", detail: "编辑草稿需要本项目的 OWNER 或 EDITOR 角色，并且另外持有 EDIT_DRAFT 平台资格。" };
    case "state":
      return { title: "草稿当前不可编辑", detail: access.state === "IN_REVIEW" ? "草稿已提交审核，内容冻结到审核结束或撤回审核。" : "草稿已封存或归档，不能再修改；新内容需要从版本开始新的草稿（本控制台尚不提供）。" };
  }
}

type Context = "create" | "draft";

export function writeErrorText(error: WriteError, context: Context): { title: string; detail: string; tone: Tone } {
  const notSent = error.status === 0;
  const subject = context === "create" ? "项目没有创建" : "草稿没有保存";
  const text: Record<WriteError["code"], { title: string; detail: string; tone?: Tone }> = {
    AUTH_REQUIRED: notSent
      ? { title: "没有可用的登录会话", detail: `当前浏览器没有有效会话，请求没有发送，${subject}。在新标签页重新登录后回到这里重试，本页内容不会丢失。`, tone: "danger" }
      : { title: "登录会话已失效", detail: `服务端拒绝了这次请求，${subject}。会话已登出、被撤销或过期。在新标签页重新登录后回到这里重试，本页内容不会丢失。`, tone: "danger" },
    DISABLED: { title: "Registry 写入接口未开启", detail: `服务端的写入开关处于关闭状态（默认值），${subject}。这是服务端的真实状态，控制台不会改用 Mock 或显示成功。`, tone: "warning" },
    FORBIDDEN: context === "create"
      ? { title: "没有创建项目的资格", detail: "服务端拒绝：创建项目需要有效且未到期、带创建权限（can_create）的内部操作员身份。没有创建任何内容。" }
      : { title: "没有保存草稿的资格", detail: "服务端拒绝：保存需要有效的内部操作员身份、单独授予的 EDIT_DRAFT 资格，以及本项目的 OWNER 或 EDITOR 角色。资格可能刚被撤销。你的修改仍保留在本页。" },
    NOT_FOUND: { title: "项目不存在，或你已不是成员", detail: `${subject}。项目可能已归档，或你在本项目的角色已被移除。你的内容仍保留在本页，可以导出。`, tone: "neutral" },
    INVALID_INPUT: notSent
      ? { title: "请求未发送", detail: "内容或参数不符合格式要求，控制台没有发送。", tone: "danger" }
      : { title: "内容被服务端拒绝", detail: `${subject}。内容不符合 Registry 的约束，例如文本长度、引用的资产不属于本项目或尚未验证。修改后再保存。`, tone: "danger" },
    PRECONDITION_REQUIRED: { title: "缺少 If-Match", detail: "服务端要求基于某个版本保存。这是控制台的缺陷，请报告。", tone: "danger" },
    PRECONDITION_FAILED: { title: "草稿已被其他人修改", detail: "你基于的版本已不是最新（412）。没有覆盖任何内容；请在下方对照服务端的当前版本，选择如何处理。", tone: "warning" },
    CONFLICT: context === "create"
      ? { title: "这个 slug 不可用", detail: "slug 已被占用或暂时冲突，没有创建项目。换一个 slug 再试。", tone: "warning" }
      : { title: "草稿状态冲突", detail: "草稿已进入不可编辑的状态，或数据库检测到并发修改。草稿没有保存；已重新读取当前状态。", tone: "warning" },
    IDEMPOTENCY_CONFLICT: { title: "幂等键冲突", detail: `同一个幂等键被用于不同的请求内容，${subject}。这是控制台的缺陷，请报告；再次提交会使用新的键。`, tone: "danger" },
    REPLAY_STALE: context === "create"
      ? { title: "原请求已不能重放", detail: "这个请求先前创建的项目已不再属于你或已归档，服务端不再返回它。请重新读取项目列表。", tone: "warning" }
      : { title: "授权已变化，原请求不能重放", detail: "这次请求之后你在本项目的授权发生了变化。草稿没有按这个请求保存；已重新读取当前状态与资格。", tone: "warning" },
    PAYLOAD_TOO_LARGE: { title: "内容过大", detail: `请求体超过 256 KiB，${subject}。`, tone: "danger" },
    UNSUPPORTED_MEDIA_TYPE: { title: "请求类型不被接受", detail: "这是控制台的缺陷，请报告。", tone: "danger" },
    RATE_LIMITED: { title: "写入过于频繁", detail: `${subject}。每个会话每分钟最多 20 次写入；按服务端的 Retry-After 等待结束前，控制台不会再发送。`, tone: "warning" },
    UNAVAILABLE: { title: "服务暂不可用", detail: "结果不确定，按未知结果处理。", tone: "warning" },
  };
  return { tone: "danger", ...text[error.code] };
}

export function unknownText(reason: UnknownReason): string {
  switch (reason) {
    case "NETWORK": return "连接在收到响应前中断。";
    case "TIMEOUT": return "20 秒内没有收到响应，请求已在本机取消。";
    case "UNAVAILABLE": return "服务端返回暂不可用（503）或服务器错误。";
    case "CONTRACT_MISMATCH": return "收到的响应不符合契约，控制台不采信它。";
  }
}

export const writeStatusText = (error: WriteError) => (error.status === 0 ? `未发送 · ${error.code}` : `${error.status} ${error.code}`);
