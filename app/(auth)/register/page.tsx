import { signUp } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";

export default function RegisterPage() {
  return (
    <>
      <p className="text-sm font-medium text-primary">创建账号</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">开始你的私人 AI 空间</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">使用邮箱注册，密码至少需要 8 个字符。</p>
      <AuthForm action={signUp} mode="signup" />
    </>
  );
}
