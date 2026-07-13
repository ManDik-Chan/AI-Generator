"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import {
  mobileNavigation,
  navigationItemActive,
} from "@/components/layout/navigation";
import { cn } from "@/lib/utils";

function MobileItem({ item, pathname }: { item: (typeof mobileNavigation)[number]; pathname: string }) {
  const active = navigationItemActive(pathname, item.href);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-1 text-[.625rem] font-medium transition-colors duration-panel",
        active ? "text-primary" : "text-muted-foreground active:bg-surface-muted",
      )}
      href={item.href}
    >
      <item.icon aria-hidden="true" className="size-[1.05rem]" />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

export function MobileNavigation() {
  const pathname = usePathname();
  const [home, chat, personas, tools] = mobileNavigation;

  return (
    <nav
      aria-label="移动端主导航"
      data-mobile-navigation
      className="fixed inset-x-2.5 bottom-[max(.625rem,env(safe-area-inset-bottom))] z-50 grid h-[4.125rem] grid-cols-[1fr_1fr_4rem_1fr_1fr] items-center rounded-[1.375rem] border border-border/12 bg-surface-raised/90 px-2 py-1 shadow-[0_20px_60px_hsl(var(--overlay)/.20)] backdrop-blur-2xl min-[821px]:hidden"
    >
      <MobileItem item={home} pathname={pathname} />
      <MobileItem item={chat} pathname={pathname} />
      <Link
        aria-label="新建对话"
        className="grid size-[3.125rem] place-items-center justify-self-center rounded-[1.125rem] bg-foreground text-background shadow-[0_10px_25px_hsl(var(--overlay)/.25)] transition-transform active:scale-95"
        href="/chat"
      >
        <Plus aria-hidden="true" className="size-6" />
      </Link>
      <MobileItem item={personas} pathname={pathname} />
      <MobileItem item={tools} pathname={pathname} />
    </nav>
  );
}
