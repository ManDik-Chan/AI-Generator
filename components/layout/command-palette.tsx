"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileCheck2, FolderPlus, MessageSquarePlus, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { navigationGroups, resolveHref, visibleItems, type ShellMode } from "@/components/layout/navigation";
import { Dialog } from "@/components/ui/dialog";
import { statusMeta } from "@/features/platform/status";
import { cn } from "@/lib/utils";

interface Entry {
  key: string;
  label: string;
  description?: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  group: string;
}

function entries(mode: ShellMode, isAdmin: boolean): Entry[] {
  const demo = mode === "demo";
  const actions: Entry[] = [
    { key: "new-chat", label: "新建对话", description: demo ? "演示对话" : "开始一段新的对话", href: demo ? "/platform/chat" : "/chat", icon: MessageSquarePlus, group: "快速操作" },
    { key: "new-project", label: "新建项目", description: "演示状态 · 不会保存", href: demo ? "/platform/projects/new" : "/projects/new", icon: FolderPlus, group: "快速操作", badge: statusMeta.dev.label },
    { key: "manifest", label: "校验 Manifest", description: "在浏览器内检查 P0.5 契约", href: demo ? "/platform/developer#manifest" : "/developer#manifest", icon: FileCheck2, group: "快速操作" },
  ];
  const pages = navigationGroups.flatMap((group) => visibleItems(group.items, mode, isAdmin).map((item) => ({
    key: item.key,
    label: item.label,
    description: item.description,
    href: resolveHref(item, mode) as string,
    icon: item.icon,
    badge: item.status ? statusMeta[item.status].label : undefined,
    group: group.label,
  })));
  return [...actions, ...pages];
}

export function CommandPalette({ open, onOpenChange, mode, isAdmin }: { open: boolean; onOpenChange(open: boolean): void; mode: ShellMode; isAdmin: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => entries(mode, isAdmin), [mode, isAdmin]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((entry) => `${entry.label} ${entry.description ?? ""} ${entry.group}`.toLowerCase().includes(q));
  }, [all, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };
  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    close();
    router.push(entry.href);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(results.length - 1, index + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    if (event.key === "Enter") { event.preventDefault(); go(results[active]); }
  };

  let lastGroup = "";
  return (
    <Dialog className="w-[min(36rem,calc(100%-2rem))]" description="只列出真实存在的页面；未上线的模块会标出状态。" onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open} title="搜索与跳转">
      <label className="flex min-h-12 items-center gap-2 rounded-full border border-border/16 bg-background px-4 transition-[border-color,box-shadow] duration-300 focus-within:border-foreground focus-within:shadow-[0_0_0_3px_hsl(var(--lime)/.55)]">
        <Search aria-hidden="true" className="size-4 text-muted-foreground" />
        <input
          aria-activedescendant={results[active] ? `cmd-${results[active].key}` : undefined}
          aria-controls="command-results"
          aria-label="搜索页面或操作"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入页面或操作…"
          role="combobox"
          aria-expanded="true"
          value={query}
        />
      </label>
      <div className="mt-3" id="command-results" ref={listRef} role="listbox">
        {results.map((entry, index) => {
          const header = entry.group !== lastGroup ? entry.group : null;
          lastGroup = entry.group;
          return (
            <div key={entry.key}>
              {header ? <p className="px-2 pb-1 pt-3 text-[.6875rem] text-muted-foreground first:pt-1">{header}</p> : null}
              <button
                aria-selected={index === active}
                className={cn("group flex min-h-12 w-full items-center gap-3 rounded-full px-2 text-left text-sm transition-colors duration-200", index === active ? "bg-surface text-foreground" : "text-muted-foreground")}
                data-index={index}
                id={`cmd-${entry.key}`}
                onClick={() => go(entry)}
                onMouseEnter={() => setActive(index)}
                role="option"
                type="button"
              >
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-300", index === active ? "bg-lime text-[hsl(var(--ink))]" : "bg-surface-raised shadow-[inset_0_0_0_1px_hsl(var(--border)/.1)]")}><entry.icon aria-hidden="true" className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{entry.label}</span>
                  {entry.description ? <span className="block truncate text-[.75rem] text-muted-foreground">{entry.description}</span> : null}
                </span>
                {entry.badge ? <span className="shrink-0 rounded-full border border-border/16 px-1.5 py-px text-[.625rem]">{entry.badge}</span> : null}
                <CornerDownLeft aria-hidden="true" className={cn("mr-2 size-3.5 shrink-0", index === active ? "opacity-60" : "opacity-0")} />
              </button>
            </div>
          );
        })}
        {!results.length ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的页面或操作。</p> : null}
      </div>
    </Dialog>
  );
}
