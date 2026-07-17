import Link from "next/link";
import { Brain, History, LockKeyhole, LogOut, MessageSquareText, ShieldCheck, Sparkles, UserRound } from "lucide-react";
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
  const [profile, conversations, personas, memories, toolRuns] = await Promise.all([
    prisma.profile.findUnique({ where: { id: user.id } }),
    prisma.conversation.count({ where: { userId: user.id } }),
    prisma.persona.count({ where: { userId: user.id, archivedAt: null } }),
    prisma.memory.count({ where: { userId: user.id, enabled: true } }),
    prisma.toolRun.count({ where: { userId: user.id, retainContent: true } }),
  ]);
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="真实账户概览">
          {[{ label: "对话", value: conversations, icon: MessageSquareText }, { label: "专属人格", value: personas, icon: UserRound }, { label: "启用记忆", value: memories, icon: Brain }, { label: "保留的工具记录", value: toolRuns, icon: History }].map((item) => <Surface className="flex items-center gap-3 p-4" key={item.label}><span className="premium-icon-tile size-10 shrink-0"><item.icon className="size-4" /></span><div><p className="text-xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p></div></Surface>)}
        </section>

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

        <Surface className="p-5 sm:p-6">
          <div className="flex items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-info-subtle text-info"><LockKeyhole className="size-4" /></span><div><h2 className="text-card-title">安全与数据边界</h2><p className="mt-1 text-supporting">登录身份由 Supabase 服务端验证；AI 密钥只存在于服务端；图片和工具素材位于私有空间，通过短期签名访问。</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="premium-subpanel p-4"><p className="premium-kicker">IDENTITY</p><p className="mt-2 text-sm font-semibold">服务端身份</p><p className="mt-1 text-xs leading-5 text-muted-foreground">不会信任浏览器传入的 userId。</p></div><div className="premium-subpanel p-4"><p className="premium-kicker">STORAGE</p><p className="mt-2 text-sm font-semibold">私有素材</p><p className="mt-1 text-xs leading-5 text-muted-foreground">不公开数据库或 Storage 路径。</p></div><div className="premium-subpanel p-4"><p className="premium-kicker">HISTORY</p><p className="mt-2 text-sm font-semibold">按次选择历史</p><p className="mt-1 text-xs leading-5 text-muted-foreground">每次工具运行都可决定是否保留内容。</p></div></div>
        </Surface>

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
