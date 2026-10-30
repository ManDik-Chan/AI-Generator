"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, Menu } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RollText } from "@/components/ui/roll-text";
import { cn } from "@/lib/utils";

const links = [
  { href: "/explore", label: "探索" },
  { href: "/demos", label: "Demo" },
  { href: "/docs", label: "开发者" },
  { href: "/platform", label: "演示工作台" },
  { href: "/platform/hub", label: "AI Hub" },
] as const;

/** Header for public pages outside the landing (Explore, showcases): the same pill language. */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="safe-inline sticky top-0 z-40 bg-background/86 backdrop-blur-xl min-[1024px]:px-0">
        <div className="mx-auto flex min-h-[4.5rem] max-w-[100rem] items-center gap-4 px-1 min-[521px]:px-3 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)]">
          <Brand href="/" />
          <nav aria-label="站点导航" className="ml-auto hidden items-center gap-2 min-[900px]:flex">
            <div className="flex items-center rounded-full bg-surface-raised p-1 shadow-[0_0_0_1px_hsl(var(--border)/.08)]">
              {links.map((link) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <Link aria-current={active ? "page" : undefined} className={cn("flex h-9 items-center rounded-full px-4 text-[.8125rem] font-medium transition-colors duration-500", active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")} href={link.href} key={link.href} prefetch={false}>
                    <RollText text={link.label} />
                  </Link>
                );
              })}
            </div>
            <Link className="btn-wipe flex h-10 items-center gap-1.5 rounded-full border border-foreground bg-foreground px-4 text-[.8125rem] font-medium text-background" href="/login" prefetch={false}><RollText text="登录" /></Link>
          </nav>
          <div className="ml-auto flex items-center gap-1.5 min-[900px]:ml-0">
            <ThemeToggle compact className="rounded-full border border-border/12 bg-surface-raised" />
            <Button aria-label="打开站点菜单" className="rounded-full border border-border/12 bg-surface-raised min-[900px]:hidden" onClick={() => setOpen(true)} size="icon-sm" variant="ghost"><Menu className="size-4" /></Button>
          </div>
        </div>
      </header>
      <Dialog description="公开项目、可运行的 Demo、开发者文档与登录入口。" onOpenChange={setOpen} open={open} title="AI-Generator">
        <nav aria-label="站点菜单" className="grid gap-1">
          {[{ href: "/", label: "官网首页" }, ...links].map((link) => (
            <Link className="flex min-h-12 items-center rounded-full px-4 text-base font-medium text-muted-foreground hover:bg-surface hover:text-foreground" href={link.href} key={link.href} onClick={() => setOpen(false)} prefetch={false}>{link.label}</Link>
          ))}
          <div className="mt-3 grid gap-2 border-t border-border/10 pt-4">
            <Button asChild><Link href="/login" onClick={() => setOpen(false)} prefetch={false}><LogIn className="size-4" />登录</Link></Button>
            <Button asChild variant="outline"><Link href="/register" onClick={() => setOpen(false)} prefetch={false}>注册账号</Link></Button>
          </div>
        </nav>
      </Dialog>
    </>
  );
}
