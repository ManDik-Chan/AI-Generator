import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export function MobileHeader({ title, back, action }: { title?: string; back?: React.ReactNode; action?: React.ReactNode }) { return <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 border-b border-border/70 bg-background/88 px-4 py-2 backdrop-blur-xl md:hidden"><div className="flex min-w-0 items-center gap-2">{title ? <>{back ?? <Brand compact />}<span className="truncate text-sm font-semibold">{title}</span></> : <Brand className="min-w-0" />}</div><div className="flex shrink-0 items-center gap-1">{action}<ThemeToggle compact /><Button aria-label="打开账号" asChild size="icon-sm" variant="ghost"><Link href="/account"><CircleUserRound className="size-[1.1rem]" /></Link></Button></div></header>; }
