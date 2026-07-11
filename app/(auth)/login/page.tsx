import { AuthForm } from "@/features/auth/components/auth-form";
import { signIn } from "@/features/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ configuration?: string; registered?: string }>;
}) {
  const { configuration, registered } = await searchParams;

  return (
    <>
      <p className="text-sm font-medium text-primary">欢迎回来</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">登录你的 AI 空间</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">会话、人格和记忆都只属于你的账号。</p>
      {registered === "1" && (
        <p className="mt-4 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
          注册成功。若已启用邮箱验证，请先检查收件箱。
        </p>
      )}
      {configuration === "missing" && (
        <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          当前环境尚未配置 Supabase，登录功能暂不可用。
        </p>
      )}
      <AuthForm action={signIn} mode="login" />
    </>
  );
}
