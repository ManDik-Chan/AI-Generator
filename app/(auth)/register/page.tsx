import { signUp } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { safeReturnPath } from "@/lib/auth/return-path";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <p className="text-label text-primary">创建账号</p>
      <h1 className="mt-2 text-page-title text-balance break-keep break-words">开始你的私人 AI 空间</h1>
      <p className="mt-3 text-supporting">使用邮箱注册，几分钟内即可开始。</p>
      <AuthForm action={signUp} mode="signup" nextPath={safeReturnPath(next)} />
    </>
  );
}
