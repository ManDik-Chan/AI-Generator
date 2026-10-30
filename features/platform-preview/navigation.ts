import { Brain, FolderKanban, LayoutDashboard, MessageSquareText, Puzzle, Shapes, Workflow, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { CapabilityStatus } from "@/features/platform-preview/status";

export interface PreviewModule {
  key: "workspace" | "projects" | "agent" | "skills" | "chat" | "personas" | "memory" | "tools";
  label: string;
  /** English product name, shown next to the Chinese label. */
  name: string;
  href: string;
  /** The real, signed-in route, when one exists. */
  realHref?: string;
  icon: LucideIcon;
  status: CapabilityStatus;
  summary: string;
}

export const platformModules: readonly PreviewModule[] = [
  { key: "workspace", label: "统一控制台", name: "Workspace", href: "/platform", realHref: "/workspace", icon: LayoutDashboard, status: "live", summary: "所有项目、Agent、Skills 与 AI 能力的统一入口。" },
  { key: "projects", label: "项目", name: "Projects", href: "/platform/projects", icon: FolderKanban, status: "dev", summary: "以项目组织成员、资料、版本、发布与运行记录。" },
  { key: "agent", label: "Agent 编排", name: "Agent", href: "/platform/agent", realHref: "/agents", icon: Workflow, status: "dev", summary: "Planner 拆解任务，多个 Worker 并行执行，协调器收束结论。" },
  { key: "skills", label: "能力模块", name: "Skills", href: "/platform/skills", icon: Puzzle, status: "planned", summary: "把常用能力封装为可复用、可授权、可组合的模块。" },
];

export const hubModules: readonly PreviewModule[] = [
  { key: "chat", label: "AI 对话", name: "Chat", href: "/platform/chat", realHref: "/chat", icon: MessageSquareText, status: "live", summary: "流式回答、会话历史与 Markdown 渲染，可引用已确认记忆。" },
  { key: "personas", label: "专属人格", name: "Personas", href: "/platform/personas", realHref: "/personas", icon: Shapes, status: "live", summary: "为不同任务建立独立的角色、语气与边界。" },
  { key: "memory", label: "长期记忆", name: "Memory", href: "/platform/memory", realHref: "/memories", icon: Brain, status: "live", summary: "只保存你确认过的事，来源可追溯，可随时修改或关闭。" },
  { key: "tools", label: "AI 工具", name: "Tools", href: "/platform/tools", realHref: "/tools", icon: Wrench, status: "live", summary: "总结、改写、翻译、图片理解、图片生成与多 Agent 头脑风暴。" },
];

export const previewNavigation = [
  { label: "平台", items: platformModules },
  { label: "AI Hub", items: hubModules },
] as const;

export const allPreviewModules: readonly PreviewModule[] = [...platformModules, ...hubModules];

/** "/platform" only matches itself; every other module also owns its sub-pages. */
export function previewItemActive(pathname: string, href: string) {
  if (href === "/platform") return pathname === "/platform";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findPreviewModule(pathname: string) {
  return allPreviewModules.find((item) => item.href !== "/platform" && previewItemActive(pathname, item.href)) ?? platformModules[0];
}
