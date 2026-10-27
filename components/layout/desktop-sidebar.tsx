"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MoreHorizontal,
  MessageSquarePlus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Brand } from "@/components/layout/brand";
import {
  navigationGroups,
  navigationItemActive,
} from "@/components/layout/navigation";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { RollText } from "@/components/ui/roll-text";
import { cn } from "@/lib/utils";

const menuLink =
  "flex min-h-10 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-300 hover:bg-surface hover:text-foreground";

export function DesktopSidebar({ viewer }: { viewer?: ShellViewer }) {
  const pathname = usePathname();
  const displayName = viewer?.displayName || viewer?.email || "我的空间";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.75rem] flex-col border-r border-border/10 bg-background px-4 py-5 min-[821px]:flex">
      <div className="px-1.5">
        <Brand />
      </div>

      <div className="mt-6 rounded-card bg-surface px-3 py-2.5">
        <p className="truncate text-xs font-medium">{displayName}</p>
        <p className="mt-0.5 truncate text-[.6875rem] text-muted-foreground">{viewer?.role === "ADMIN" ? "Administrator workspace" : "Private workspace"}</p>
      </div>

      <Button asChild className="mt-3 w-full justify-start">
        <Link href="/chat" prefetch={false}>
          <MessageSquarePlus aria-hidden="true" className="size-4" />
          新建对话
        </Link>
      </Button>

      <nav
        aria-label="主导航"
        className="premium-scrollbar mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1"
      >
        {navigationGroups.map((group) => (
          <section key={group.label}>
            <p className="mb-2 px-3 text-xs text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                if ("adminOnly" in item && item.adminOnly && viewer?.role !== "ADMIN") return null;
                const active = navigationItemActive(pathname, item.href, "matches" in item ? item.matches : undefined);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-10 items-center gap-3 rounded-full px-3 text-[.875rem] font-medium transition-colors duration-300",
                      active
                        ? "bg-lime text-[hsl(213_21%_10%)]"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                    href={item.href}
                    key={item.href}
                    prefetch={false}
                  >
                    <item.icon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0 transition-transform duration-500 ease-out-expo group-hover:-rotate-6",
                        active ? "text-current" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <RollText className="truncate" text={item.label} />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="mt-auto shrink-0 space-y-2">
        <div className="rounded-card bg-surface p-1.5">
          <p className="px-2 pb-1.5 pt-1 text-[.6875rem] text-muted-foreground">
            外观
          </p>
          <ThemeToggle />
        </div>

        <Dropdown
          className="w-full"
          placement="top-end"
          trigger={
            <span className="flex min-h-[3.25rem] w-full items-center gap-2.5 rounded-card bg-surface px-2.5 text-left transition-colors duration-300 hover:bg-surface-muted">
              <Avatar
                className="size-8 rounded-full border-0"
                name={displayName}
                src={viewer?.avatarUrl}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {displayName}
                </span>
                <span className="mt-0.5 block truncate text-[.6875rem] text-muted-foreground">
                  {viewer?.role === "ADMIN" ? "管理员空间" : "个人空间"}
                </span>
              </span>
              <MoreHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
            </span>
          }
        >
          <Link className={menuLink} href="/account" prefetch={false}>
            <UserRound className="size-4" />账号与设置
          </Link>
          {viewer?.role === "ADMIN" ? (
            <Link className={menuLink} href="/admin" prefetch={false}>
              <ShieldCheck className="size-4" />系统管理
            </Link>
          ) : null}
        </Dropdown>
      </div>
    </aside>
  );
}
