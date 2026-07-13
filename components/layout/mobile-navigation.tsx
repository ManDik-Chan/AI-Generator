"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mobileNavigation, navigationItemActive } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";

export function MobileNavigation() {
  const pathname = usePathname();
  return <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border/80 bg-surface/95 px-2 pt-1.5 shadow-[0_-16px_40px_-34px_hsl(var(--overlay)/.5)] backdrop-blur-xl md:hidden" aria-label="移动端主导航">{mobileNavigation.map((item) => { const active = navigationItemActive(pathname, item.href); return <Link aria-current={active ? "page" : undefined} className={cn("relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 text-[.6875rem] font-medium transition-colors duration-fast", active ? "text-primary" : "text-muted-foreground active:bg-surface-subtle")} href={item.href} key={item.href}><span className={cn("grid size-7 place-items-center rounded-lg", active && "bg-primary-subtle")}><item.icon className="size-[1.15rem]" aria-hidden="true" /></span><span className="max-w-full truncate">{item.label}</span></Link>; })}</nav>;
}
