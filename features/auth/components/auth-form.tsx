"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { initialAuthActionState, type AuthActionState } from "@/features/auth/types";

interface AuthFormProps {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  mode: "login" | "signup";
}

export function AuthForm({ action, mode }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialAuthActionState);
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className="mt-7 space-y-4">
      {isSignup && (
        <label className="block text-sm font-medium">
          显示名称
          <input
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            maxLength={50}
            name="displayName"
            required
          />
        </label>
      )}
      <label className="block text-sm font-medium">
        邮箱
        <input
          autoComplete="email"
          className="mt-2 h-11 w-full rounded-xl border bg-background px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="block text-sm font-medium">
        密码
        <input
          autoComplete={isSignup ? "new-password" : "current-password"}
          className="mt-2 h-11 w-full rounded-xl border bg-background px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>
      {state.error && (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">
          {state.error}
        </p>
      )}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "正在处理…" : isSignup ? "创建账号" : "登录"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? "已经有账号？" : "还没有账号？"}{" "}
        <Link className="font-medium text-primary hover:underline" href={isSignup ? "/login" : "/register"}>
          {isSignup ? "去登录" : "注册"}
        </Link>
      </p>
    </form>
  );
}
