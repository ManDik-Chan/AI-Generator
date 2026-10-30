import type {
  AssetState,
  ClaimStatus,
  DataFlow,
  DraftState,
  IntegrationMode,
  ProjectCategory,
  ProjectRole,
  RunStatus,
  Visibility,
} from "@/features/platform/types";

export type Tone = "ink" | "lime" | "success" | "warning" | "danger" | "info" | "neutral";

export const visibilityMeta: Record<Visibility, { label: string; detail: string; tone: Tone }> = {
  PUBLIC: { label: "公开", detail: "出现在探索目录，任何人可浏览公开内容", tone: "success" },
  UNLISTED: { label: "不公开列出", detail: "不进入目录；持有链接的人可以浏览公开内容", tone: "info" },
  PRIVATE: { label: "私有", detail: "只有项目成员可见，链接对其他人无效", tone: "neutral" },
};

export const draftStateMeta: Record<DraftState, { label: string; tone: Tone }> = {
  DRAFT: { label: "草稿", tone: "neutral" },
  IN_REVIEW: { label: "审核中", tone: "warning" },
  PUBLISHED: { label: "已发布", tone: "success" },
  ARCHIVED: { label: "已归档", tone: "neutral" },
};

export const assetStateMeta: Record<AssetState, { label: string; tone: Tone; detail: string }> = {
  QUARANTINED: { label: "隔离待检", tone: "warning", detail: "刚上传，尚未通过格式与内容校验" },
  VALIDATED: { label: "已校验", tone: "info", detail: "格式通过，等待审核人批准" },
  APPROVED: { label: "已批准", tone: "success", detail: "可以出现在已发布版本中" },
  RETIRED: { label: "已停用", tone: "neutral", detail: "历史版本保留引用，新版本不可使用" },
  REJECTED: { label: "已拒绝", tone: "danger", detail: "未通过审核，不会被展示" },
};

export const roleLabels: Record<ProjectRole, string> = {
  OWNER: "所有者",
  EDITOR: "编辑",
  REVIEWER: "审核",
  PUBLISHER: "发布",
  VIEWER: "只读",
};

export const integrationMeta: Record<IntegrationMode, { level: string; label: string; detail: string }> = {
  SHOWCASE: { level: "L0", label: "展示", detail: "成果页、文档与静态资产；不执行外部代码" },
  EMBED: { level: "L1", label: "受控嵌入", detail: "独立 origin 的沙箱交互；安全验收后开放" },
  REMOTE_API: { level: "L2", label: "远程 API", detail: "OpenAPI 契约 + 平台任务代理、授权与审计" },
};

export const categoryLabels: Record<ProjectCategory, string> = {
  research: "科研",
  software: "软件",
  algorithm: "算法",
  "web-service": "Web 服务",
  ai: "AI 应用",
  other: "其他",
};

export const claimMeta: Record<ClaimStatus, { label: string; tone: Tone }> = {
  EXPERIMENT_VERIFIED: { label: "实验已验证", tone: "success" },
  SOURCE_IMPLEMENTED: { label: "源码已实现", tone: "info" },
  DOCUMENTED: { label: "仅有文档", tone: "warning" },
  PLANNED: { label: "规划中", tone: "neutral" },
};

export const runStatusMeta: Record<RunStatus, { label: string; tone: Tone; terminal: boolean }> = {
  PENDING: { label: "排队中", tone: "neutral", terminal: false },
  ACCEPTED: { label: "已受理", tone: "info", terminal: false },
  RUNNING: { label: "运行中", tone: "lime", terminal: false },
  SUCCEEDED: { label: "成功", tone: "success", terminal: true },
  FAILED: { label: "失败", tone: "danger", terminal: true },
  CANCELLED: { label: "已取消", tone: "neutral", terminal: true },
  TIMED_OUT: { label: "超时", tone: "warning", terminal: true },
};

export const dataFlowMeta: Record<DataFlow, { label: string; detail: string }> = {
  none: { label: "不处理你的数据", detail: "只读取项目的公开内容" },
  platform: { label: "由平台处理", detail: "输入在平台服务端处理，按你的账户隔离" },
  developer: { label: "交给项目运营方", detail: "输入会发送到开发者运营的服务，需要你单独同意" },
};

export function formatVersion(version: string) {
  return /^\d/.test(version) ? `v${version}` : version;
}
