"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { navigationGroups, navigationItemActive } from "@/components/layout/navigation";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function MobileWorkspaceMenu({ viewer }: { viewer?: ShellViewer }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-label="打开工作空间菜单" className="border border-border/12 bg-surface/72" onClick={() => setOpen(true)} size="icon-sm" variant="ghost"><Menu className="size-4" /></Button>
      <Dialog description="访问全部已实现的工作空间和工具。" onOpenChange={setOpen} open={open} title="AI-Generator">
        <nav aria-label="全部功能" className="space-y-5">
          {navigationGroups.map((group) => {
            const items = group.items.filter((item) => !("adminOnly" in item && item.adminOnly) || viewer?.role === "ADMIN");
            if (!items.length) return null;
            return <section key={group.label}><p className="premium-kicker mb-2 px-2">{group.label}</p><div className="grid gap-1">{items.map((item) => {
              const active = navigationItemActive(pathname, item.href, "matches" in item ? item.matches : undefined);
              return <Link aria-current={active ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-control px-3 text-sm font-semibold", active ? "bg-primary-subtle text-primary-subtle-foreground" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground")} href={item.href} key={item.href} onClick={() => setOpen(false)}><item.icon className="size-4" /><span>{item.label}</span></Link>;
            })}</div></section>;
          })}
        </nav>
      </Dialog>
    </>
  );
}
