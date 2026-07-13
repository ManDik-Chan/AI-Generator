"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, MessageSquarePlus } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { navigationGroups, navigationItemActive } from "@/components/layout/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DesktopSidebar() {
  const pathname = usePathname();
  return <aside className="sticky top-0 hidden h-screen w-[17rem] flex-col border-r border-border/75 bg-surface/92 px-4 py-5 backdrop-blur-xl md:flex"><div className="px-2"><Brand /></div><Button className="mt-7 w-full justify-start" asChild><Link href="/chat"><MessageSquarePlus className="size-4" aria-hidden="true" />新建对话</Link></Button><nav className="mt-6 space-y-6" aria-label="主导航">{navigationGroups.map((group) => <section key={group.label}><p className="mb-1.5 px-3 text-caption font-semibold uppercase tracking-[.08em]">{group.label}</p><div className="space-y-1">{group.items.map((item) => { const active = navigationItemActive(pathname, item.href); return <Link aria-current={active ? "page" : undefined} className={cn("group flex min-h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-fast", active ? "bg-primary-subtle text-primary-subtle-foreground" : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground")} href={item.href} key={item.href}><item.icon className={cn("size-[1.05rem]", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden="true" />{item.label}{active ? <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}</Link>; })}</div></section>)}</nav><div className="mt-auto space-y-3"><ThemeToggle /><Link className={cn("flex min-h-11 items-center gap-3 rounded-control border border-transparent px-3 text-sm text-muted-foreground transition-colors duration-fast hover:border-border hover:bg-surface-raised hover:text-foreground", navigationItemActive(pathname, "/account") && "bg-surface-subtle text-foreground")} href="/account"><CircleUserRound className="size-[1.1rem]" aria-hidden="true" /><span>账号与设置</span></Link></div></aside>;
}
