"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogIn, Menu } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { findPreviewModule, previewItemActive, previewNavigation } from "@/features/platform-preview/navigation";
import { statusMeta } from "@/features/platform-preview/status";
import { cn } from "@/lib/utils";

/** Desktop top bar: current module, its status and the way into the real app. */
export function PreviewTopbar() {
  const pathname = usePathname();
  const current = findPreviewModule(pathname);
  return (
    <header className="sticky top-0 z-30 hidden min-h-[4.5rem] items-center justify-between gap-6 border-b border-border/10 bg-background/88 px-[clamp(1.5rem,3vw,3rem)] backdrop-blur-xl min-[821px]:flex">
      <div className="flex min-w-0 items-baseline gap-3">
        <p className="shrink-0 text-[.9375rem] font-medium tracking-[-.01em]">{current.name} · {current.label}</p>
        <p className="truncate text-xs text-muted-foreground">平台预览 · {statusMeta[current.status].label} · 所有数据均为示例</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle compact className="rounded-full border border-border/12 bg-surface-raised" />
        <Button asChild size="sm" variant="outline"><Link href="/login" prefetch={false}><LogIn className="size-3.5" />登录</Link></Button>
      </div>
    </header>
  );
}

function PreviewMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-label="打开平台预览菜单" className="border border-border/12 bg-surface/72" onClick={() => setOpen(true)} size="icon-sm" variant="ghost"><Menu className="size-4" /></Button>
      <Dialog description="公开只读的平台预览，全部数据为示例。" onOpenChange={setOpen} open={open} title="AI-Generator 平台">
        <nav aria-label="全部模块" className="space-y-5">
          {previewNavigation.map((group) => (
            <section key={group.label}>
              <p className="premium-kicker mb-2 px-2">{group.label}</p>
              <div className="grid gap-1">
                {group.items.map((item) => {
                  const active = previewItemActive(pathname, item.href);
                  return (
                    <Link aria-current={active ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-control px-3 text-sm font-semibold", active ? "bg-primary-subtle text-primary-subtle-foreground" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground")} href={item.href} key={item.href} onClick={() => setOpen(false)} prefetch={false}>
                      <item.icon className="size-4" />
                      <span>{item.name} · {item.label}</span>
                      {item.status !== "live" ? <span className="ml-auto shrink-0 rounded-full border border-border/16 px-1.5 py-px text-[.625rem] font-medium text-muted-foreground">{statusMeta[item.status].label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="grid gap-2 border-t border-border/10 pt-4">
            <Button asChild><Link href="/login" onClick={() => setOpen(false)} prefetch={false}><LogIn className="size-4" />登录真实工作台</Link></Button>
            <Button asChild variant="outline"><Link href="/" onClick={() => setOpen(false)} prefetch={false}>返回官网</Link></Button>
          </div>
        </nav>
      </Dialog>
    </>
  );
}

export function PreviewMobileHeader() {
  const pathname = usePathname();
  const current = findPreviewModule(pathname);
  return (
    <header className="safe-inline z-40 flex min-h-[var(--mobile-header-height)] shrink-0 items-center justify-between gap-2 border-b border-border/10 bg-background/90 pb-2 pt-[max(.5rem,var(--safe-area-top))] backdrop-blur-xl min-[821px]:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <PreviewMenu />
        {pathname === "/platform" ? <Brand className="min-w-0" href="/" /> : <span className="truncate text-sm font-medium">{current.name} · {current.label}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle compact className="rounded-full border border-border/12 bg-surface-raised" />
        <Link aria-label="登录真实工作台" className="grid size-11 place-items-center rounded-full border border-border/12 bg-surface-raised" href="/login" prefetch={false}><LogIn className="size-4" /></Link>
      </div>
    </header>
  );
}

const bottomItems = [
  { name: "总览", href: "/platform", icon: LayoutDashboard },
  ...previewNavigation[0].items.slice(1).map((item) => ({ name: item.name, href: item.href, icon: item.icon })),
  { name: "AI Hub", href: "/platform/chat", icon: previewNavigation[1].items[0].icon },
];

export function PreviewMobileNavigation() {
  const pathname = usePathname();
  const hubActive = previewNavigation[1].items.some((item) => previewItemActive(pathname, item.href));
  return (
    <nav aria-label="平台预览移动端导航" className="fixed bottom-[max(.5rem,var(--safe-area-bottom))] left-[max(.5rem,var(--safe-area-left))] right-[max(.5rem,var(--safe-area-right))] z-50 grid min-h-[var(--mobile-nav-height)] grid-cols-5 items-center rounded-full border border-border/10 bg-surface-raised/92 px-1.5 py-1 shadow-[0_16px_40px_hsl(var(--overlay)/.16)] backdrop-blur-xl min-[821px]:hidden">
      {bottomItems.map((item) => {
        const active = item.name === "AI Hub" ? hubActive : previewItemActive(pathname, item.href);
        return (
          <Link aria-current={active ? "page" : undefined} className={cn("relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-[clamp(.5625rem,2.6vw,.625rem)] font-medium leading-none transition-colors duration-300", active ? "text-foreground after:absolute after:bottom-0.5 after:size-1 after:rounded-full after:bg-foreground" : "text-muted-foreground active:bg-surface")} href={item.href} key={item.href} prefetch={false}>
            <item.icon aria-hidden="true" className="size-[1.05rem]" />
            <span className="max-w-full truncate">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
