import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { profile } = await requireAdmin();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-primary">管理员</p>
      <h1 className="mt-2 text-3xl font-semibold">系统管理</h1>
      <p className="mt-3 text-muted-foreground">当前管理员：{profile.displayName ?? profile.email}</p>
      <div className="mt-7 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        模型配置、用户管理和系统设置将在后续管理功能中接入。
      </div>
    </main>
  );
}
