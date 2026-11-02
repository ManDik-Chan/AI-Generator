import { AuthForm } from "@/features/auth/components/auth-form";
import { signIn } from "@/features/auth/actions";
import { StatusBanner } from "@/components/ui/status-banner";
import { safeReturnPath } from "@/lib/auth/return-path";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabasePublicConfig } from "@/lib/env/supabase";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ configuration?: string; registered?: string; next?: string; error?: string; logout?: string }>;
}) {
  const { configuration, registered, next, error, logout } = await searchParams;
  if (getSupabasePublicConfig() && await getCurrentUser()) redirect(safeReturnPath(next));

  return (
    <>
      <p className="text-label text-primary">欢迎回来</p>
      <h1 className="mt-2 text-page-title text-balance break-keep break-words">登录你的 AI 空间</h1>
      <p className="mt-3 text-supporting">继续你的对话、助手与记忆。</p>
      {registered === "1" && (
        <StatusBanner className="mt-5" variant="success">注册成功。如果需要验证邮箱，请先检查收件箱。</StatusBanner>
      )}
      {configuration === "missing" && (
        <StatusBanner className="mt-5" title="登录暂不可用" variant="warning">服务尚未准备好，请稍后再试或联系管理员。</StatusBanner>
      )}
      {error === "callback" ? <StatusBanner className="mt-5" variant="error">验证链接已失效，请重新登录或申请新的验证邮件。</StatusBanner> : null}
      {logout === "local" ? <StatusBanner className="mt-5" variant="warning">已清除此浏览器的登录状态。会话撤销服务暂不可用，其他设备上的登录可能仍然有效。</StatusBanner> : null}
      <AuthForm action={signIn} mode="login" nextPath={safeReturnPath(next)} />
    </>
  );
}
