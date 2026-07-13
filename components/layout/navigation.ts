import { Brain, CircleUserRound, Home, MessageSquareText, Shapes, Wrench } from "lucide-react";

export function navigationItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export const navigationGroups = [
  { label: "工作空间", items: [
    { label: "首页", href: "/", icon: Home }, { label: "聊天", href: "/chat", icon: MessageSquareText },
    { label: "AI 助手", href: "/personas", icon: Shapes }, { label: "长期记忆", href: "/memories", icon: Brain },
  ] },
  { label: "独立工具", items: [{ label: "工具中心", href: "/tools", icon: Wrench }] },
] as const;

export const mobileNavigation = [
  { label: "首页", href: "/", icon: Home }, { label: "聊天", href: "/chat", icon: MessageSquareText },
  { label: "助手", href: "/personas", icon: Shapes }, { label: "工具", href: "/tools", icon: Wrench },
  { label: "我的", href: "/account", icon: CircleUserRound },
] as const;
