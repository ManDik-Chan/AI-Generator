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
import { cn } from "@/lib/utils";

const menuLink =
  "flex min-h-10 items-center gap-2 rounded-control px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground";

export function DesktopSidebar({ viewer }: { viewer?: ShellViewer }) {
  const pathname = usePathname();
  const displayName = viewer?.displayName || viewer?.email || "我的空间";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[14.375rem] flex-col border-r border-border/10 bg-surface-raised/90 px-[1.125rem] py-[1.375rem] backdrop-blur-2xl min-[821px]:flex min-[1181px]:w-[17rem]">
      <div className="px-1.5">
        <Brand />
      </div>

      <Button asChild className="mt-[1.375rem] w-full justify-start">
        <Link href="/chat">
          <MessageSquarePlus aria-hidden="true" className="size-4" />
          新建对话
        </Link>
      </Button>

      <nav aria-label="主导航" className="mt-6 space-y-5">
        {navigationGroups.map((group) => (
          <section key={group.label}>
            <p className="mb-2 px-2.5 text-[.625rem] font-extrabold uppercase tracking-[.14em] text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = navigationItemActive(pathname, item.href);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-[2.625rem] items-center gap-3 rounded-[.75rem] px-2.5 text-[.8125rem] font-semibold transition-colors duration-panel",
                      active
                        ? "bg-primary-subtle text-foreground"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    <item.icon
                      aria-hidden="true"
                      className={cn(
                        "size-[1.05rem]",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    {item.label}
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="ml-auto size-1.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/.12)]"
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="mt-auto space-y-2.5">
        <div className="rounded-control border border-border/12 bg-surface/70 p-1.5">
          <p className="px-2 pb-1.5 pt-1 text-[.6875rem] font-semibold text-muted-foreground">
            外观
          </p>
          <ThemeToggle />
        </div>

        <Dropdown
          className="w-full"
          trigger={
            <span className="flex min-h-[3.25rem] w-full items-center gap-2.5 rounded-control border border-border/12 bg-surface/76 px-2.5 text-left transition-colors hover:bg-surface-raised">
              <Avatar
                className="size-8"
                name={displayName}
                src={viewer?.avatarUrl}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">
                  {displayName}
                </span>
                <span className="mt-0.5 block truncate text-[.625rem] text-muted-foreground">
                  {viewer?.role === "ADMIN" ? "管理员空间" : "个人空间"}
                </span>
              </span>
              <MoreHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
            </span>
          }
        >
          <Link className={menuLink} href="/account">
            <UserRound className="size-4" />账号与设置
          </Link>
          {viewer?.role === "ADMIN" ? (
            <Link className={menuLink} href="/admin">
              <ShieldCheck className="size-4" />系统管理
            </Link>
          ) : null}
        </Dropdown>
      </div>
    </aside>
  );
}
