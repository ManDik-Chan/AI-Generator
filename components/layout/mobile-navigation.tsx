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
        "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-0.5 text-[clamp(.5625rem,2.6vw,.625rem)] font-medium leading-none transition-colors duration-panel",
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
      className="fixed bottom-[max(.5rem,var(--safe-area-bottom))] left-[max(.5rem,var(--safe-area-left))] right-[max(.5rem,var(--safe-area-right))] z-50 grid min-h-[var(--mobile-nav-height)] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center rounded-[1.375rem] border border-border/12 bg-surface-raised/88 px-1.5 py-1 shadow-[0_18px_48px_hsl(var(--overlay)/.22)] backdrop-blur-2xl min-[360px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_minmax(0,1fr)_minmax(0,1fr)] min-[821px]:hidden"
    >
      <MobileItem item={home} pathname={pathname} />
      <MobileItem item={chat} pathname={pathname} />
      <Link
        aria-label="新建对话"
        className="grid size-11 place-items-center justify-self-center rounded-[1.125rem] bg-primary text-primary-foreground shadow-[0_10px_28px_hsl(var(--primary)/.3)] transition-transform active:scale-95 min-[360px]:size-[3.125rem]"
        href="/chat"
      >
        <Plus aria-hidden="true" className="size-6" />
      </Link>
      <MobileItem item={personas} pathname={pathname} />
      <MobileItem item={tools} pathname={pathname} />
    </nav>
  );
}
