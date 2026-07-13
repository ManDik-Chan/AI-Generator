import Link from "next/link";
import { Brain, ShieldCheck } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await requireUser(); const profile = await prisma.profile.findUnique({ where: { id: user.id } }); const name = profile?.displayName ?? "我的 AI 空间";
  return <AppShell mobileTitle="我的" variant="reading"><PageHeader description="管理账号、外观和你允许 AI 使用的长期记忆。" eyebrow="账号与设置" title={name} /><div className="mt-8 space-y-4"><Surface className="p-5 sm:p-6"><div className="flex items-center gap-4"><Avatar className="size-12" name={name} /><div className="min-w-0"><p className="truncate text-card-title">{name}</p><p className="mt-0.5 truncate text-supporting">{user.email}</p></div><Badge className="ml-auto" variant={profile?.role === "ADMIN" ? "info" : "neutral"}>{profile?.role === "ADMIN" ? "管理员" : "用户"}</Badge></div></Surface><Surface className="p-5 sm:p-6"><h2 className="text-card-title">外观</h2><p className="mt-1 text-supporting">选择浅色、深色，或跟随系统设置。</p><ThemeToggle className="mt-4 w-full sm:max-w-sm" /></Surface><Surface className="p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-subtle text-primary"><Brain className="size-4" /></span><div className="min-w-0"><h2 className="text-card-title">AI 记住的内容</h2><p className="mt-1 text-supporting">查看、修改、停用或删除长期记忆。</p><Button asChild className="mt-4" size="sm" variant="outline"><Link href="/memories">管理记忆</Link></Button></div></div></Surface>{profile?.role === "ADMIN" ? <Surface className="p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-info" /><div><h2 className="text-card-title">管理员入口</h2><Button asChild className="mt-3" size="sm" variant="outline"><Link href="/admin">打开系统管理</Link></Button></div></div></Surface> : null}<form action={signOut}><Button type="submit" variant="outline">退出登录</Button></form></div></AppShell>;
}
