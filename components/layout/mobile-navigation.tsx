"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";

import {
  isItemActive,
  mobileNavigation,
  navigationGroups,
  resolveHref,
  visibleItems,
  type NavigationItem,
  type ShellMode,
} from "@/components/layout/navigation";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { statusMeta } from "@/features/platform/status";
import { cn } from "@/lib/utils";

const itemClass = "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-[clamp(.5625rem,2.6vw,.625rem)] font-medium leading-none transition-colors duration-300";

function MobileItem({ item, pathname, mode }: { item: NavigationItem; pathname: string; mode: ShellMode }) {
  const active = isItemActive(pathname, item, mode);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(itemClass, active ? "text-foreground after:absolute after:bottom-0.5 after:size-1 after:rounded-full after:bg-foreground" : "text-muted-foreground active:bg-surface")}
      href={resolveHref(item, mode) as string}
      prefetch={false}
    >
      <item.icon aria-hidden="true" className="size-[1.05rem]" />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

/** Full navigation sheet for phones and tablets. */
function MenuSheet({ open, onOpenChange, mode, viewer }: { open: boolean; onOpenChange(open: boolean): void; mode: ShellMode; viewer?: ShellViewer }) {
  const pathname = usePathname();
  const demo = mode === "demo";
  return (
    <Dialog description={demo ? "演示工作台：所有数据均为示例，不连接任何账户。" : "平台模块、AI Hub 与账户设置。"} onOpenChange={onOpenChange} open={open} title="AI-Generator">
      <nav aria-label="全部功能" className="space-y-5">
        {navigationGroups.map((group) => {
          const items = visibleItems(group.items, mode, viewer?.role === "ADMIN");
          if (!items.length) return null;
          return (
            <section key={group.label}>
              <p className="kicker mb-2 px-2">{group.label}</p>
              <div className="grid gap-1">
                {items.map((item) => {
                  const active = isItemActive(pathname, item, mode);
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={cn("flex min-h-12 items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors duration-300", active ? "bg-lime text-[hsl(var(--ink))]" : "text-muted-foreground hover:bg-surface hover:text-foreground")}
                      href={resolveHref(item, mode) as string}
                      key={item.key}
                      onClick={() => onOpenChange(false)}
                      prefetch={false}
                    >
                      <item.icon aria-hidden="true" className="size-4" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.status ? <span className="shrink-0 rounded-full border border-border/16 px-1.5 py-px text-[.625rem] text-current">{statusMeta[item.status].label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section>
          <p className="kicker mb-2 px-2">外观</p>
          <ThemeToggle />
        </section>
        <div className="grid gap-2 border-t border-border/10 pt-4">
          {demo ? <Button asChild><Link href="/login" onClick={() => onOpenChange(false)} prefetch={false}>登录真实工作台</Link></Button> : null}
          <Button asChild variant="outline"><Link href="/" onClick={() => onOpenChange(false)} prefetch={false}>返回官网</Link></Button>
        </div>
      </nav>
    </Dialog>
  );
}

/** Floating bottom bar below 1024px: home, projects, new chat, AI Hub and the menu sheet. */
export function MobileNavigation({ mode = "live", viewer }: { mode?: ShellMode; viewer?: ShellViewer }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [home, projects, hub] = mobileNavigation;

  return (
    <>
      <nav
        aria-label="移动端主导航"
        data-mobile-navigation
        className="fixed bottom-[max(.5rem,var(--safe-area-bottom))] left-[max(.5rem,var(--safe-area-left))] right-[max(.5rem,var(--safe-area-right))] z-50 mx-auto grid min-h-[var(--mobile-nav-height)] max-w-[34rem] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center rounded-full border border-border/10 bg-surface-raised/92 px-1.5 py-1 shadow-[0_16px_40px_hsl(var(--overlay)/.16)] backdrop-blur-xl min-[360px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_minmax(0,1fr)_minmax(0,1fr)] min-[1024px]:hidden"
      >
        <MobileItem item={home} mode={mode} pathname={pathname} />
        <MobileItem item={projects} mode={mode} pathname={pathname} />
        <Link
          aria-label="新建对话"
          className="grid size-11 place-items-center justify-self-center rounded-full bg-lime text-[hsl(var(--ink))] shadow-[0_8px_22px_hsl(var(--overlay)/.18)] transition-transform duration-300 active:scale-95 min-[360px]:size-[3.125rem]"
          href={mode === "demo" ? "/platform/chat" : "/chat"}
          prefetch={false}
        >
          <Plus aria-hidden="true" className="size-6" />
        </Link>
        <MobileItem item={hub} mode={mode} pathname={pathname} />
        <button aria-label="打开全部功能菜单" className={cn(itemClass, "text-muted-foreground active:bg-surface")} onClick={() => setOpen(true)} type="button">
          <Menu aria-hidden="true" className="size-[1.05rem]" />
          <span>菜单</span>
        </button>
      </nav>
      <MenuSheet mode={mode} onOpenChange={setOpen} open={open} viewer={viewer} />
    </>
  );
}
