import { AuthForm } from "@/features/auth/components/auth-form";
import { signIn } from "@/features/auth/actions";
import { StatusBanner } from "@/components/ui/status-banner";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ configuration?: string; registered?: string }>;
}) {
  const { configuration, registered } = await searchParams;

  return (
    <>
      <p className="text-label text-primary">欢迎回来</p>
      <h1 className="mt-2 text-page-title">登录你的 AI 空间</h1>
      <p className="mt-3 text-supporting">继续你的对话、助手与记忆。</p>
      {registered === "1" && (
        <StatusBanner className="mt-5" variant="success">注册成功。如果需要验证邮箱，请先检查收件箱。</StatusBanner>
      )}
      {configuration === "missing" && (
        <StatusBanner className="mt-5" title="登录暂不可用" variant="warning">服务尚未准备好，请稍后再试或联系管理员。</StatusBanner>
      )}
      <AuthForm action={signIn} mode="login" />
    </>
  );
}
