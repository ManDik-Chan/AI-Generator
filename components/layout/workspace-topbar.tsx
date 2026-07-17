"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Command, Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { navigationGroups, navigationItemActive } from "@/components/layout/navigation";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Dialog } from "@/components/ui/dialog";

const routeMeta = [
  { path: "/chat", title: "AI 对话", subtitle: "连续上下文 · 流式生成 · 长期记忆" },
  { path: "/personas", title: "专属人格", subtitle: "创建、编辑与管理不同的 AI 助手" },
  { path: "/memories", title: "长期记忆", subtitle: "你决定 AI 记住什么" },
  { path: "/tools/image-generate", title: "图片生成", subtitle: "单图生成工作台与私有画廊" },
  { path: "/tools/image", title: "图片理解", subtitle: "从截图、图表和照片中提取信息" },
  { path: "/tools/brainstorm", title: "多 Agent 头脑风暴", subtitle: "四个 Worker 独立分析并由协调器综合" },
  { path: "/tools/history", title: "运行历史", subtitle: "查看工具状态、恢复与结果" },
  { path: "/tools", title: "AI 工具", subtitle: "总结、改写、翻译与视觉创作" },
  { path: "/account", title: "账户与隐私", subtitle: "身份、主题、历史和数据边界" },
  { path: "/admin", title: "系统管理", subtitle: "用户、用量、角色和运行状态" },
  { path: "/", title: "控制中心", subtitle: "你的私人 AI 工作空间已准备就绪" },
] as const;

export function WorkspaceTopbar({ viewer }: { viewer?: ShellViewer }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const meta = routeMeta.find((item) => navigationItemActive(pathname, item.path)) ?? routeMeta[routeMeta.length - 1];
  const commands = useMemo(() => navigationGroups.flatMap((group) => group.items)
    .filter((item) => !("adminOnly" in item && item.adminOnly) || viewer?.role === "ADMIN")
    .filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())), [query, viewer?.role]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 hidden min-h-[4.5rem] items-center justify-between gap-6 border-b border-border/10 bg-background/82 px-[clamp(1.5rem,3vw,3rem)] backdrop-blur-2xl min-[821px]:flex">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{meta.title}</p>
          <p className="mt-1 truncate text-[.6875rem] text-muted-foreground">{meta.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle compact className="border border-border/12 bg-surface/70" />
          <button className="flex min-h-10 w-[clamp(13rem,20vw,18rem)] items-center gap-2 rounded-control border border-border/14 bg-surface/70 px-3 text-left text-xs text-muted-foreground transition hover:border-primary/35 hover:bg-surface-raised" onClick={() => setOpen(true)} type="button">
            <Search aria-hidden="true" className="size-4" />
            <span className="min-w-0 flex-1 truncate">搜索功能或操作</span>
            <kbd className="rounded-md border border-border/12 bg-surface-muted px-1.5 py-1 text-[.625rem]">⌘ K</kbd>
          </button>
        </div>
      </header>
      <Dialog description="只显示真实存在并经过权限控制的产品入口。" onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }} open={open} title="搜索功能或操作">
        <label className="flex min-h-12 items-center gap-2 rounded-control border border-border/14 bg-surface-muted/60 px-3 focus-within:border-primary/45">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <input autoFocus className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" onChange={(event) => setQuery(event.target.value)} placeholder="输入页面名称…" value={query} />
        </label>
        <div className="mt-3 space-y-1">
          {commands.map((item) => <Link className="flex min-h-12 items-center gap-3 rounded-control px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground" href={item.href} key={item.href} onClick={() => setOpen(false)}><span className="premium-icon-tile size-9"><item.icon className="size-4" /></span><span className="min-w-0 flex-1 truncate">{item.label}</span><Command className="size-3.5 opacity-35" /></Link>)}
          {!commands.length ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的真实功能。</p> : null}
        </div>
      </Dialog>
    </>
  );
}
