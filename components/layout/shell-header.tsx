"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, FolderPlus, KeyRound, LogIn, MessageSquarePlus, MoreHorizontal, Plus, Search, ShieldCheck, UserRound } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { CommandPalette } from "@/components/layout/command-palette";
import { isItemActive, primaryNavigation, resolveHref, type ShellMode } from "@/components/layout/navigation";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { RollText } from "@/components/ui/roll-text";
import { statusMeta } from "@/features/platform/status";
import { cn } from "@/lib/utils";

const menuLink = "flex min-h-10 items-center gap-2.5 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-300 hover:bg-surface hover:text-foreground";

/** Opens the command palette with ⌘K / Ctrl+K from anywhere in the shell. */
function useCommandShortcut(open: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
}

/**
 * Primary navigation as one white capsule (the landing page's nav pills, joined). The ink
 * indicator slides to the active section; before it is measured the active pill paints
 * its own background, so the server render is never blank.
 */
function PillNav({ mode, pathname }: { mode: ShellMode; pathname: string }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);
  const items = primaryNavigation.filter((item) => resolveHref(item, mode));
  const activeKey = items.find((item) => isItemActive(pathname, item, mode))?.key;

  const measure = useCallback(() => {
    const group = groupRef.current;
    const active = group?.querySelector<HTMLElement>("[data-active='true']");
    if (!group || !active) return setIndicator(null);
    setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, activeKey]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setAnimate(true));
    const onResize = () => measure();
    window.addEventListener("resize", onResize, { passive: true });
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", onResize);
    };
  }, [measure]);

  return (
    <nav aria-label="主导航" className="hidden min-[1024px]:block">
      <div className="relative flex items-center rounded-full bg-surface-raised p-1 shadow-[0_0_0_1px_hsl(var(--border)/.08),0_10px_30px_-18px_hsl(var(--overlay)/.35)]" ref={groupRef}>
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-1 left-0 rounded-full bg-foreground", animate && "transition-[transform,width] duration-700 ease-out-expo", !indicator && "opacity-0")}
          style={indicator ? { transform: `translateX(${indicator.left}px)`, width: indicator.width } : undefined}
        />
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative z-[1] flex h-9 items-center gap-1.5 rounded-full px-4 text-[.8125rem] font-medium transition-colors duration-500",
                active ? "text-background" : "text-muted-foreground hover:text-foreground",
                active && !indicator && "bg-foreground",
              )}
              data-active={active ? "true" : undefined}
              href={resolveHref(item, mode) as string}
              key={item.key}
              prefetch={false}
            >
              <RollText text={item.label} />
              {item.status ? <span aria-label={statusMeta[item.status].label} className={cn("size-1.5 rounded-full", item.status === "dev" ? "bg-warning" : "bg-muted-foreground/60")} title={statusMeta[item.status].label} /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function CreateMenu({ mode }: { mode: ShellMode }) {
  const demo = mode === "demo";
  return (
    <Dropdown
      className="hidden min-[1024px]:block"
      placement="bottom-end"
      trigger={
        <span className="btn-wipe flex h-10 items-center gap-1.5 rounded-full border border-foreground bg-foreground px-4 text-[.8125rem] font-medium text-background">
          <Plus aria-hidden="true" className="size-4" />新建
        </span>
      }
    >
      <Link className={menuLink} href={demo ? "/platform/chat" : "/chat"} prefetch={false}><MessageSquarePlus className="size-4" />新建对话</Link>
      <Link className={menuLink} href={demo ? "/platform/projects/new" : "/projects/new"} prefetch={false}>
        <FolderPlus className="size-4" />新建项目<span className="ml-auto rounded-full border border-border/16 px-1.5 text-[.625rem]">{statusMeta.dev.label}</span>
      </Link>
    </Dropdown>
  );
}

function AccountMenu({ viewer }: { viewer?: ShellViewer }) {
  const displayName = viewer?.displayName || viewer?.email || "我的空间";
  return (
    <Dropdown
      className="hidden min-[1024px]:block"
      placement="bottom-end"
      trigger={
        <span className="flex h-10 items-center gap-2 rounded-full border border-border/12 bg-surface-raised pl-1 pr-2.5 transition-colors duration-300 hover:border-foreground/30">
          <Avatar className="size-8 rounded-full border-0" name={displayName} src={viewer?.avatarUrl} />
          <MoreHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="sr-only">打开账户菜单</span>
        </span>
      }
    >
      <div className="px-3 pb-2 pt-1.5">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="mt-0.5 truncate text-[.6875rem] text-muted-foreground">{viewer?.role === "ADMIN" ? "管理员空间" : "个人空间"}</p>
      </div>
      <Link className={menuLink} href="/account" prefetch={false}><UserRound className="size-4" />账号与设置</Link>
      <Link className={menuLink} href="/connections" prefetch={false}><KeyRound className="size-4" />连接与授权<span className="ml-auto rounded-full border border-border/16 px-1.5 text-[.625rem]">{statusMeta.planned.label}</span></Link>
      {viewer?.role === "ADMIN" ? <Link className={menuLink} href="/admin" prefetch={false}><ShieldCheck className="size-4" />系统管理</Link> : null}
      <Link className={menuLink} href="/" prefetch={false}><ArrowUpRight className="size-4" />官网</Link>
    </Dropdown>
  );
}

export function ShellHeader({ mode = "live", viewer, mobileTitle }: { mode?: ShellMode; viewer?: ShellViewer; mobileTitle?: string }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandShortcut(openPalette);
  const demo = mode === "demo";
  const displayName = viewer?.displayName || viewer?.email || "我的空间";

  return (
    <>
      <header className="safe-inline sticky top-0 min-[1024px]:px-0 z-40 shrink-0 border-b border-border/10 bg-background/86 backdrop-blur-xl" data-shell-header="">
        <div className="mx-auto flex min-h-[var(--mobile-header-height)] max-w-[100rem] items-center gap-3 px-1 pb-2 pt-[max(.5rem,var(--safe-area-top))] min-[521px]:px-3 min-[1024px]:min-h-[var(--shell-header-height)] min-[1024px]:gap-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-3 min-[1024px]:flex-none">
            <Brand className={cn(mobileTitle && "max-[1023px]:hidden")} href={demo ? "/platform" : "/workspace"} />
            {mobileTitle ? <span className="truncate text-[.9375rem] font-medium min-[1024px]:hidden">{mobileTitle}</span> : null}
          </div>

          <PillNav mode={mode} pathname={pathname} />

          <div className="ml-auto flex shrink-0 items-center gap-1.5 min-[1024px]:gap-2">
            <button
              aria-label="搜索与跳转"
              className="group grid size-10 place-items-center rounded-full border border-border/12 bg-surface-raised text-muted-foreground transition-colors duration-300 hover:border-foreground/30 hover:text-foreground min-[1024px]:flex min-[1024px]:w-[clamp(9rem,13vw,13rem)] min-[1024px]:items-center min-[1024px]:justify-start min-[1024px]:gap-2 min-[1024px]:px-3.5"
              onClick={openPalette}
              type="button"
            >
              <Search aria-hidden="true" className="size-4 transition-transform duration-500 ease-out-expo group-hover:-rotate-12" />
              <span className="hidden flex-1 text-left text-xs min-[1024px]:inline">搜索</span>
              <kbd className="hidden rounded-full bg-surface-muted px-2 py-0.5 font-sans text-[.625rem] min-[1024px]:inline">⌘K</kbd>
            </button>
            <CreateMenu mode={mode} />
            <ThemeToggle compact className="rounded-full border border-border/12 bg-surface-raised max-[379px]:hidden" />
            {demo ? (
              <Link className="btn-wipe flex h-10 items-center gap-1.5 rounded-full border border-foreground bg-foreground px-4 text-[.8125rem] font-medium text-background" href="/login" prefetch={false}>
                <LogIn aria-hidden="true" className="size-4" /><span className="max-[380px]:sr-only">登录</span>
              </Link>
            ) : (
              <>
                <AccountMenu viewer={viewer} />
                <Link aria-label="打开账号" className="grid size-10 place-items-center rounded-full border border-border/12 bg-surface-raised min-[1024px]:hidden" href="/account" prefetch={false}>
                  <Avatar className="size-7 rounded-full border-0" name={displayName} src={viewer?.avatarUrl} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <CommandPalette isAdmin={viewer?.role === "ADMIN"} mode={mode} onOpenChange={setPaletteOpen} open={paletteOpen} />
    </>
  );
}
