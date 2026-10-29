/*
 * Sample projects for the public preview. Field names and lifecycle states follow the
 * P0.5 Registry contract (Project / Draft / Version / Release / Asset / Membership / Review),
 * which is still in development and not deployed. Nothing here is read from a database.
 */

export type ProjectVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type DraftState = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";
export type AssetState = "QUARANTINED" | "VALIDATED" | "APPROVED" | "RETIRED" | "REJECTED";
export type ProjectRole = "OWNER" | "EDITOR" | "REVIEWER" | "PUBLISHER" | "VIEWER";

export const visibilityLabels: Record<ProjectVisibility, string> = { PRIVATE: "私有", UNLISTED: "不公开列出", PUBLIC: "公开" };
export const draftStateLabels: Record<DraftState, string> = { DRAFT: "草稿", IN_REVIEW: "审核中", PUBLISHED: "已发布", ARCHIVED: "已归档" };
export const assetStateLabels: Record<AssetState, string> = { QUARANTINED: "隔离待检", VALIDATED: "已校验", APPROVED: "已批准", RETIRED: "已停用", REJECTED: "已拒绝" };
export const roleLabels: Record<ProjectRole, string> = { OWNER: "所有者", EDITOR: "编辑", REVIEWER: "审核", PUBLISHER: "发布", VIEWER: "只读" };

export interface PreviewProject {
  slug: string;
  name: string;
  summary: string;
  category: string;
  visibility: ProjectVisibility;
  draftState: DraftState;
  version: string;
  integration: "SHOWCASE" | "REMOTE_API";
  updated: string;
  tint: string;
  members: { name: string; roles: ProjectRole[] }[];
  workspace: { key: string; label: string; detail: string; count?: number }[];
  assets: { name: string; kind: string; size: string; state: AssetState }[];
  docs: { title: string; language: string }[];
  releases: { version: string; state: "PUBLISHED" | "WITHDRAWN"; note: string }[];
}

export const previewProjects: readonly PreviewProject[] = [
  {
    slug: "ai-generator",
    name: "AI-Generator 平台",
    summary: "本平台自身：统一工作台、AI Hub 与平台化 Registry 的演进记录。",
    category: "Web 服务",
    visibility: "PUBLIC",
    draftState: "IN_REVIEW",
    version: "0.1.0",
    integration: "SHOWCASE",
    updated: "示例 · 2 小时前",
    tint: "#E9E778",
    members: [
      { name: "示例所有者", roles: ["OWNER", "PUBLISHER"] },
      { name: "示例编辑", roles: ["EDITOR"] },
      { name: "示例审核人", roles: ["REVIEWER"] },
    ],
    workspace: [
      { key: "overview", label: "概览与展示", detail: "Overview · Architecture · Docs 三段展示内容" },
      { key: "chats", label: "项目对话", detail: "与项目绑定的对话与 Persona", count: 12 },
      { key: "agent", label: "Agent 运行", detail: "Planner / Worker / 协调器的运行记录", count: 4 },
      { key: "assets", label: "资料与资产", detail: "隔离上传 → 校验 → 审核批准后才可展示", count: 4 },
      { key: "docs", label: "技术文档", detail: "Markdown 文档，随版本封存", count: 2 },
      { key: "versions", label: "版本与发布", detail: "不可变 Version 与可撤回 Release", count: 1 },
    ],
    assets: [
      { name: "architecture.md", kind: "text/markdown", size: "18 KB", state: "APPROVED" },
      { name: "workspace-cover.png", kind: "image/png", size: "640 KB", state: "VALIDATED" },
      { name: "agent-flow.svg", kind: "image/svg+xml", size: "22 KB", state: "QUARANTINED" },
      { name: "legacy-banner.jpg", kind: "image/jpeg", size: "1.2 MB", state: "RETIRED" },
    ],
    docs: [{ title: "平台架构说明", language: "zh-CN" }, { title: "Registry 数据模型", language: "zh-CN" }],
    releases: [],
  },
  {
    slug: "sorting-research",
    name: "合成排序算法研究",
    summary: "非 AI 项目示例：只展示研究说明与基准表，不提供在线运行。",
    category: "算法研究",
    visibility: "PUBLIC",
    draftState: "PUBLISHED",
    version: "1.0.0",
    integration: "SHOWCASE",
    updated: "示例 · 昨天",
    tint: "#B8C6EA",
    members: [{ name: "示例所有者", roles: ["OWNER", "EDITOR"] }, { name: "示例审核人", roles: ["REVIEWER", "PUBLISHER"] }],
    workspace: [
      { key: "overview", label: "概览与展示", detail: "研究摘要、方法与基准结果" },
      { key: "assets", label: "资料与资产", detail: "已批准的图表与数据说明", count: 3 },
      { key: "docs", label: "技术文档", detail: "方法说明与复现步骤", count: 1 },
      { key: "versions", label: "版本与发布", detail: "当前发布 v1.0.0", count: 2 },
    ],
    assets: [
      { name: "benchmark-table.md", kind: "text/markdown", size: "6 KB", state: "APPROVED" },
      { name: "runtime-chart.png", kind: "image/png", size: "210 KB", state: "APPROVED" },
      { name: "dataset-notes.md", kind: "text/markdown", size: "4 KB", state: "APPROVED" },
    ],
    docs: [{ title: "Method and reproduction", language: "en" }],
    releases: [
      { version: "1.0.0", state: "PUBLISHED", note: "当前发布 · 审核人与提交人不同" },
      { version: "0.9.0", state: "WITHDRAWN", note: "已撤回 · 历史版本保留，不可复活" },
    ],
  },
  {
    slug: "research-notes",
    name: "研究笔记工作区",
    summary: "私有项目示例：仅成员可见，用于整理资料、对话与 Agent 结论。",
    category: "个人研究",
    visibility: "PRIVATE",
    draftState: "DRAFT",
    version: "0.0.1",
    integration: "SHOWCASE",
    updated: "示例 · 3 天前",
    tint: "#B9CDB2",
    members: [{ name: "示例所有者", roles: ["OWNER"] }],
    workspace: [
      { key: "chats", label: "项目对话", detail: "只在项目成员之间可见", count: 6 },
      { key: "agent", label: "Agent 运行", detail: "深度模式 6 Worker 的研究拆解", count: 2 },
      { key: "assets", label: "资料与资产", detail: "未审核资产不会出现在任何公开页面", count: 1 },
    ],
    assets: [{ name: "reading-list.md", kind: "text/markdown", size: "3 KB", state: "QUARANTINED" }],
    docs: [],
    releases: [],
  },
  {
    slug: "demo-api-adapter",
    name: "远程 API 适配器",
    summary: "未来示例：通过注册的远程端点调用项目能力，凭据与调用权限分别授权。",
    category: "远程服务",
    visibility: "UNLISTED",
    draftState: "DRAFT",
    version: "0.0.1",
    integration: "REMOTE_API",
    updated: "规划中",
    tint: "#F2C2AE",
    members: [{ name: "示例所有者", roles: ["OWNER"] }, { name: "示例协作者", roles: ["VIEWER"] }],
    workspace: [
      { key: "overview", label: "概览与展示", detail: "能力说明与数据去向" },
      { key: "endpoint", label: "远程端点", detail: "规划中：端点版本、输入 Schema 与授权封存" },
    ],
    assets: [],
    docs: [],
    releases: [],
  },
];

export function getPreviewProject(slug: string) {
  return previewProjects.find((project) => project.slug === slug);
}

/** The eight Registry entities from the P0.5 contract, for the "how it works" panel. */
export const registryEntities = [
  ["Project", "稳定 slug、所有者与可见性，slug 永不复用"],
  ["ProjectDraft", "唯一活动草稿：DRAFT → IN_REVIEW → PUBLISHED"],
  ["ProjectVersion", "审核通过后封存的不可变快照"],
  ["ProjectRelease", "一次发布；可撤回，不可覆盖或复活"],
  ["ProjectAsset", "隔离上传，校验、批准后才可展示"],
  ["ProjectDocumentation", "随版本封存的 Markdown 文档"],
  ["ProjectMembership", "所有者 / 编辑 / 审核 / 发布 / 只读角色"],
  ["PublicationReview", "独立审核，审核人不能是提交人"],
] as const;
