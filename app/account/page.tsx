import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-primary">账号</p>
      <h1 className="mt-2 text-3xl font-semibold">{profile?.displayName ?? "我的 AI 空间"}</h1>
      <div className="mt-7 rounded-2xl border bg-card p-6">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground">邮箱</dt>
            <dd className="mt-1 font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">角色</dt>
            <dd className="mt-1 font-medium">{profile?.role ?? "USER"}</dd>
          </div>
        </dl>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="outline">退出登录</Button>
        </form>
      </div>
    </main>
  );
}
