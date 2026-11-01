"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-field";
import { StatusBanner } from "@/components/ui/status-banner";
import { initialAuthActionState, type AuthActionState } from "@/features/auth/types";

interface AuthFormProps {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  mode: "login" | "signup";
  nextPath?: string;
}

export function AuthForm({ action, mode, nextPath = "/workspace" }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialAuthActionState);
  const [showPassword, setShowPassword] = useState(false);
  const isSignup = mode === "signup";

  return (
    // React server actions supply the POST method and form encoding.
    <form action={formAction} autoComplete="on" aria-describedby={state.error ? "auth-error" : undefined} className="mt-7 space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      {isSignup ? (
        <Field htmlFor="displayName" label="显示名称" required>
          <Input autoComplete="name" id="displayName" maxLength={50} name="displayName" required />
        </Field>
      ) : null}
      <Field htmlFor="email" label="邮箱" required>
        <Input autoComplete="username" autoCapitalize="none" id="email" name="email" required spellCheck={false} type="email" />
      </Field>
      <Field help={isSignup ? "至少 8 个字符" : undefined} htmlFor="password" label="密码" required>
        <div className="relative">
          <Input
            aria-describedby={state.error ? "auth-error" : isSignup ? "password-description" : undefined}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="pr-12"
            id="password"
            minLength={isSignup ? 8 : undefined}
            name="password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            aria-pressed={showPassword}
            className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-[.7rem] text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {!isSignup ? (
        <div className="space-y-1.5">
          <label className="flex min-h-6 items-center gap-2 text-sm" htmlFor="rememberMe">
            <input aria-describedby="rememberMe-description" className="size-4 accent-foreground" id="rememberMe" name="rememberMe" type="checkbox" value="on" />
            保持登录
          </label>
          <p className="text-caption text-muted-foreground" id="rememberMe-description">
            仅在私人设备上使用；不勾选时使用浏览器会话 Cookie。共享设备使用后请退出登录。
          </p>
        </div>
      ) : null}
      {state.error ? <StatusBanner id="auth-error" variant="error">{state.error}</StatusBanner> : null}
      <Button className="w-full" loading={pending} type="submit">
        {pending ? "正在处理" : isSignup ? "创建账号" : "登录"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? "已经有账号？" : "还没有账号？"}{" "}
        <Link className="font-bold text-primary underline-offset-4 hover:underline" href={`${isSignup ? "/login" : "/register"}?next=${encodeURIComponent(nextPath)}`}>
          {isSignup ? "去登录" : "注册"}
        </Link>
      </p>
    </form>
  );
}
