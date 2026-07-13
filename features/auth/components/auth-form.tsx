"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-field";
import { StatusBanner } from "@/components/ui/status-banner";
import { initialAuthActionState, type AuthActionState } from "@/features/auth/types";

interface AuthFormProps { action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>; mode: "login" | "signup" }
export function AuthForm({ action, mode }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialAuthActionState); const [showPassword, setShowPassword] = useState(false); const isSignup = mode === "signup";
  return <form action={formAction} aria-describedby={state.error ? "auth-error" : undefined} className="mt-7 space-y-4">{isSignup ? <Field htmlFor="displayName" label="显示名称" required><Input autoComplete="name" id="displayName" maxLength={50} name="displayName" required /></Field> : null}<Field htmlFor="email" label="邮箱" required><Input autoComplete="email" id="email" name="email" required type="email" /></Field><Field help={isSignup ? "至少 8 个字符" : undefined} htmlFor="password" label="密码" required><div className="relative"><Input aria-describedby={state.error ? "auth-error" : undefined} autoComplete={isSignup ? "new-password" : "current-password"} className="pr-12" id="password" minLength={8} name="password" required type={showPassword ? "text" : "password"} /><button aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface-subtle hover:text-foreground" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></Field>{state.error ? <StatusBanner id="auth-error" variant="error">{state.error}</StatusBanner> : null}<Button className="w-full" loading={pending} type="submit">{pending ? "正在处理" : isSignup ? "创建账号" : "登录"}</Button><p className="text-center text-sm text-muted-foreground">{isSignup ? "已经有账号？" : "还没有账号？"} <Link className="font-medium text-primary underline-offset-4 hover:underline" href={isSignup ? "/login" : "/register"}>{isSignup ? "去登录" : "注册"}</Link></p></form>;
}
