import Link from "next/link";
import { Brain, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { AppShell } from "@/components/layout/app-shell";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });
  const name = profile?.displayName ?? "我的 AI 空间";
  const viewer: ShellViewer = {
    avatarUrl: profile?.avatarUrl ?? undefined,
    displayName: profile?.displayName ?? undefined,
    email: profile?.email ?? user.email ?? undefined,
    role: profile?.role,
  };

  return (
    <AppShell mobileTitle="我的" variant="reading" viewer={viewer}>
      <PageHeader
        description="管理你的个人资料、外观和 AI 可以使用的长期记忆。"
        eyebrow="PERSONAL SPACE"
        title="账号与设置"
      />

      <div className="mt-8 space-y-4">
        <Surface className="relative overflow-hidden p-5 sm:p-7" variant="default">
          <div aria-hidden="true" className="surface-grid absolute inset-0 opacity-25 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
          <div aria-hidden="true" className="absolute -right-12 -top-20 size-56 rounded-full bg-primary/20 blur-[70px]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar className="size-20 rounded-[1.5rem]" name={name} src={profile?.avatarUrl ?? undefined} />
            <div className="min-w-0 flex-1">
              <p className="premium-kicker">PROFILE</p>
              <h1 className="mt-2 overflow-wrap-anywhere text-2xl font-bold tracking-[-.04em]">{name}</h1>
              <p className="mt-1 overflow-wrap-anywhere text-supporting">{user.email}</p>
            </div>
            <Badge variant={profile?.role === "ADMIN" ? "info" : "neutral"}>
              {profile?.role === "ADMIN" ? "管理员" : "个人用户"}
            </Badge>
          </div>
        </Surface>

        <div className="grid gap-4 sm:grid-cols-2">
          <Surface className="p-5 sm:p-6">
            <span className="grid size-10 place-items-center rounded-control bg-primary-subtle text-primary">
              <Sparkles className="size-4" />
            </span>
            <h2 className="mt-5 text-card-title">外观</h2>
            <p className="mt-1 text-supporting">选择浅色、深色，或跟随系统。</p>
            <ThemeToggle className="mt-4 w-full" />
          </Surface>

          <Surface className="p-5 sm:p-6">
            <span className="grid size-10 place-items-center rounded-control bg-primary-subtle text-primary">
              <Brain className="size-4" />
            </span>
            <h2 className="mt-5 text-card-title">AI 记住的内容</h2>
            <p className="mt-1 text-supporting">查看、修改、停用或删除长期记忆。</p>
            <Button asChild className="mt-4" size="sm" variant="outline">
              <Link href="/memories">管理记忆</Link>
            </Button>
          </Surface>
        </div>

        {profile?.role === "ADMIN" ? (
          <Surface className="flex items-start gap-4 p-5 sm:p-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-control bg-info-subtle text-info">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-card-title">管理员入口</h2>
              <p className="mt-1 text-supporting">只展示已经存在并经过权限校验的管理能力。</p>
              <Button asChild className="mt-4" size="sm" variant="outline">
                <Link href="/admin">打开系统管理</Link>
              </Button>
            </div>
          </Surface>
        ) : null}

        <form action={signOut}>
          <Button type="submit" variant="outline">
            <LogOut className="size-4" />退出登录
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
