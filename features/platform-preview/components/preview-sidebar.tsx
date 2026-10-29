"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, LogIn } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { RollText } from "@/components/ui/roll-text";
import { previewItemActive, previewNavigation } from "@/features/platform-preview/navigation";
import { statusMeta } from "@/features/platform-preview/status";
import { cn } from "@/lib/utils";

/** Same structure and styling as the workspace sidebar, but pointed at the public preview. */
export function PreviewSidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.75rem] flex-col border-r border-border/10 bg-background px-4 py-5 min-[821px]:flex">
      <div className="px-1.5"><Brand href="/" /></div>

      <div className="mt-6 rounded-card bg-surface px-3 py-2.5">
        <p className="truncate text-xs font-medium">平台预览</p>
        <p className="mt-0.5 truncate text-[.6875rem] text-muted-foreground">公开只读 · 示例数据</p>
      </div>

      <Button asChild className="mt-3 w-full justify-start">
        <Link href="/login" prefetch={false}><LogIn aria-hidden="true" className="size-4" />登录真实工作台</Link>
      </Button>

      <nav aria-label="平台预览导航" className="premium-scrollbar mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1">
        {previewNavigation.map((group) => (
          <section key={group.label}>
            <p className="mb-2 px-3 text-xs text-muted-foreground">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = previewItemActive(pathname, item.href);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-10 items-center gap-3 rounded-full px-3 text-[.875rem] font-medium transition-colors duration-300",
                      active ? "bg-lime text-[hsl(213_21%_10%)]" : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                    href={item.href}
                    key={item.href}
                    prefetch={false}
                  >
                    <item.icon aria-hidden="true" className={cn("size-4 shrink-0 transition-transform duration-500 ease-out-expo group-hover:-rotate-6", active ? "text-current" : "text-muted-foreground group-hover:text-foreground")} />
                    <RollText className="truncate" text={item.name} />
                    {item.status !== "live" ? (
                      <span className={cn("ml-auto shrink-0 rounded-full px-1.5 py-px text-[.625rem] font-medium leading-4", active ? "bg-[hsl(213_21%_10%/.1)] text-current" : "border border-border/16 text-muted-foreground")}>{statusMeta[item.status].label}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="mt-auto shrink-0 space-y-2">
        <div className="rounded-card bg-surface p-1.5">
          <p className="px-2 pb-1.5 pt-1 text-[.6875rem] text-muted-foreground">外观</p>
          <ThemeToggle />
        </div>
        <Link className="group flex min-h-11 items-center justify-between rounded-card bg-surface px-3 text-xs text-muted-foreground transition-colors duration-300 hover:bg-surface-muted hover:text-foreground" href="/" prefetch={false}>
          返回官网<ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </aside>
  );
}
