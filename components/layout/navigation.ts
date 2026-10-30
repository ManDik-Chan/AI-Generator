import {
  Brain,
  Braces,
  Compass,
  FolderKanban,
  History,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  Shapes,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { CapabilityStatus } from "@/features/platform/status";

/**
 * Information architecture of the AIG platform.
 *
 * - live: the signed-in workspace (real routes, server identity checks).
 * - demo: the public demo workspace under /platform, which mirrors the same pages with
 *   sample data so anyone can browse the product without an account.
 */
export type ShellMode = "live" | "demo";

export interface NavigationItem {
  key: string;
  label: string;
  href: string;
  /** Public demo-workspace route; omitted when the page has no demo equivalent. */
  demoHref?: string;
  icon: LucideIcon;
  /** Exact paths, or "/prefix/*" to include the prefix and everything under it. */
  matches?: readonly string[];
  demoMatches?: readonly string[];
  adminOnly?: boolean;
  /** Shown as a small badge when the module is not fully live. */
  status?: Exclude<CapabilityStatus, "live">;
  description?: string;
}

/** Label for features that are reachable but not yet signed off by the owner. */
export const IN_DEVELOPMENT_LABEL = "开发中";

export function navigationItemActive(pathname: string, href: string, matches?: readonly string[]) {
  if (matches) return matches.some((match) => match.endsWith("/*")
    ? pathname === match.slice(0, -2) || pathname.startsWith(`${match.slice(0, -2)}/`)
    : pathname === match);
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveHref(item: NavigationItem, mode: ShellMode) {
  return mode === "demo" ? item.demoHref : item.href;
}

export function isItemActive(pathname: string, item: NavigationItem, mode: ShellMode) {
  const href = resolveHref(item, mode);
  if (!href) return false;
  return navigationItemActive(pathname, href, mode === "demo" ? item.demoMatches : item.matches);
}

export const primaryNavigation: readonly NavigationItem[] = [
  { key: "home", label: "主页", href: "/workspace", demoHref: "/platform", icon: LayoutDashboard, demoMatches: ["/platform"], description: "你的工作台" },
  { key: "projects", label: "项目", href: "/projects", demoHref: "/platform/projects", icon: FolderKanban, status: "dev", description: "创建、发布与运行你的项目" },
  {
    key: "hub",
    label: "AI Hub",
    href: "/hub",
    demoHref: "/platform/hub",
    icon: Sparkles,
    matches: ["/hub", "/chat/*", "/personas/*", "/memories/*", "/tools/*", "/agents/*"],
    demoMatches: ["/platform/hub", "/platform/chat/*", "/platform/personas/*", "/platform/memory/*", "/platform/tools/*", "/platform/agent/*"],
    description: "对话、人格、记忆、工具与 Agent",
  },
  { key: "developer", label: "开发者", href: "/developer", demoHref: "/platform/developer", icon: Braces, status: "dev", description: "Manifest、契约与发布流程" },
  { key: "explore", label: "探索", href: "/explore", demoHref: "/explore", icon: Compass, description: "公开项目目录" },
];

export const hubNavigation: readonly NavigationItem[] = [
  { key: "hub-overview", label: "概览", href: "/hub", demoHref: "/platform/hub", icon: Sparkles, matches: ["/hub"], demoMatches: ["/platform/hub"] },
  { key: "chat", label: "对话", href: "/chat", demoHref: "/platform/chat", icon: MessageSquareText, description: "流式对话与会话历史" },
  { key: "personas", label: "人格", href: "/personas", demoHref: "/platform/personas", icon: Shapes, description: "为任务设定角色与语气" },
  { key: "memories", label: "记忆", href: "/memories", demoHref: "/platform/memory", icon: Brain, description: "只记住你确认过的事" },
  {
    key: "tools",
    label: "工具",
    href: "/tools",
    demoHref: "/platform/tools",
    icon: Wrench,
    matches: ["/tools", "/tools/summarize", "/tools/rewrite", "/tools/translate", "/tools/image", "/tools/image-generate", "/tools/brainstorm"],
    description: "总结、改写、翻译与图片",
  },
  { key: "agents", label: "Agent", href: "/agents", demoHref: "/platform/agent", icon: Workflow, status: "dev", description: "Planner、Worker 与协调器" },
  { key: "history", label: "运行历史", href: "/tools/history", icon: History, matches: ["/tools/history"], description: "工具状态、结果与下载" },
];

export const accountNavigation: readonly NavigationItem[] = [
  { key: "account", label: "账户与隐私", href: "/account", icon: UserRound, description: "身份、主题与数据边界" },
  { key: "connections", label: "连接与授权", href: "/connections", demoHref: "/platform/connections", icon: KeyRound, status: "planned", description: "模型凭据与项目授权" },
  { key: "admin", label: "系统管理", href: "/admin", icon: ShieldCheck, adminOnly: true, description: "用户、用量与角色" },
];

/** Grouped navigation used by the mobile menu sheet and the command palette. */
export const navigationGroups: ReadonlyArray<{ label: string; items: readonly NavigationItem[] }> = [
  { label: "平台", items: primaryNavigation },
  { label: "AI Hub", items: hubNavigation.filter((item) => item.key !== "hub-overview") },
  { label: "账户", items: accountNavigation },
];

/** Bottom bar on phones: home, projects, [new chat], AI Hub, menu. */
export const mobileNavigation = [primaryNavigation[0], primaryNavigation[1], primaryNavigation[2]] as const;

export function visibleItems(items: readonly NavigationItem[], mode: ShellMode, isAdmin: boolean) {
  return items.filter((item) => (!item.adminOnly || (mode === "live" && isAdmin)) && Boolean(resolveHref(item, mode)));
}

/** The hub sub-navigation is shown on every AI Hub page. */
export function isHubPath(pathname: string, mode: ShellMode) {
  return isItemActive(pathname, primaryNavigation[2], mode);
}
