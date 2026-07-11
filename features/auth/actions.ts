"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ensureProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import type { AuthActionState } from "@/features/auth/types";

const credentialsSchema = z.object({
  email: z.email("请输入有效的邮箱地址。"),
  password: z.string().min(8, "密码至少需要 8 个字符。"),
});

const signupSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, "请输入显示名称。").max(50, "显示名称不能超过 50 个字符。"),
});

function validationError(result: z.ZodError) {
  return result.issues[0]?.message ?? "请检查输入内容。";
}

export async function signIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: validationError(parsed.error) };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error || !data.user) {
      return { error: "邮箱或密码不正确。" };
    }

    await ensureProfile(data.user);
  } catch {
    return { error: "登录服务尚未配置完成，请稍后再试。" };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: validationError(parsed.error) };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.displayName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
      },
    });

    if (error) {
      return { error: "无法创建账号，请确认邮箱未被注册。" };
    }

    if (data.user) {
      await ensureProfile(data.user);
    }
  } catch {
    return { error: "注册服务尚未配置完成，请稍后再试。" };
  }

  redirect("/login?registered=1");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
