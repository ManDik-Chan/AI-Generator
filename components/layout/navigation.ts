import { Brain, BrainCircuit, History, Home, Image, ImagePlus, MessageSquareText, Shapes, ShieldCheck, UserRound, Workflow, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  matches?: readonly string[];
  adminOnly?: boolean;
}

export function navigationItemActive(pathname: string, href: string, matches?: readonly string[]) {
  if (matches) return matches.some((match) => match.endsWith("/*")
    ? pathname === match.slice(0, -2) || pathname.startsWith(`${match.slice(0, -2)}/`)
    : pathname === match);
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export const navigationGroups: ReadonlyArray<{ label: string; items: readonly NavigationItem[] }> = [
  { label: "工作空间", items: [
    { label: "控制中心", href: "/", icon: Home }, { label: "AI 对话", href: "/chat", icon: MessageSquareText },
    { label: "Agent 运行", href: "/agents", icon: Workflow }, { label: "AI 助手", href: "/personas", icon: Shapes }, { label: "长期记忆", href: "/memories", icon: Brain },
  ] },
  { label: "创作实验室", items: [
    { label: "文本工具", href: "/tools", icon: Wrench, matches: ["/tools", "/tools/summarize", "/tools/rewrite", "/tools/translate"] },
    { label: "图片理解", href: "/tools/image", icon: Image, matches: ["/tools/image"] },
    { label: "图片生成", href: "/tools/image-generate", icon: ImagePlus, matches: ["/tools/image-generate"] },
    { label: "多 Agent 头脑风暴", href: "/tools/brainstorm", icon: BrainCircuit, matches: ["/tools/brainstorm"] },
  ] },
  { label: "系统", items: [
    { label: "运行历史", href: "/tools/history", icon: History, matches: ["/tools/history"] },
    { label: "账户与隐私", href: "/account", icon: UserRound },
    { label: "系统管理", href: "/admin", icon: ShieldCheck, adminOnly: true },
  ] },
] as const;

export const mobileNavigation = [
  { label: "首页", href: "/", icon: Home }, { label: "聊天", href: "/chat", icon: MessageSquareText },
  { label: "助手", href: "/personas", icon: Shapes }, { label: "工具", href: "/tools", icon: Wrench },
] as const;
