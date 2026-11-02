"use server";

import { revalidatePath } from "next/cache";

import { roleChangeInputSchema, type RoleChangeErrorCode } from "@/features/admin/role-contract";
import { changePlatformRole, SafeRoleUpdateError } from "@/features/admin/role-service";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";


export interface AdminRoleActionState {
  status: "idle" | "success" | "error";
  message: string;
  code?: RoleChangeErrorCode;
}

export async function updateAdminRoleAction(
  _previous: AdminRoleActionState,
  formData: FormData,
): Promise<AdminRoleActionState> {
  const { user } = await requireAdmin();
  const parsed = roleChangeInputSchema.safeParse({ profileId: formData.get("profileId"), role: formData.get("role"), expectedRole: formData.get("expectedRole"), requestId: formData.get("requestId") });
  if (!parsed.success) return { status: "error", code: "INVALID_REQUEST", message: "角色请求无效，请刷新后重试。" };

  try {
    const changed = await changePlatformRole(prisma, user.id, parsed.data);
    revalidatePath("/admin");
    return { status: "success", message: changed ? "平台角色已更新。" : "平台角色未发生变化。" };
  } catch (error) {
    if (error instanceof SafeRoleUpdateError) return { status: "error", code: error.code, message: error.message };
    return { status: "error", code: "CONFLICT", message: "角色更新失败；请刷新后重试。" };
  }
}
