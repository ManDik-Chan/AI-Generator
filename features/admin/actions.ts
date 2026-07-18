"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

const updateRoleSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(["ADMIN", "USER"]),
});

export interface AdminRoleActionState {
  status: "idle" | "success" | "error";
  message: string;
}

class SafeRoleUpdateError extends Error {}

export async function updateAdminRoleAction(
  _previous: AdminRoleActionState,
  formData: FormData,
): Promise<AdminRoleActionState> {
  const { user } = await requireAdmin();
  const parsed = updateRoleSchema.safeParse({ profileId: formData.get("profileId"), role: formData.get("role") });
  if (!parsed.success) return { status: "error", message: "角色请求无效，请刷新后重试。" };
  if (parsed.data.profileId === user.id) return { status: "error", message: "当前管理员不能修改自己的角色。" };

  try {
    await prisma.$transaction(async (transaction) => {
      const target = await transaction.profile.findUnique({ where: { id: parsed.data.profileId }, select: { role: true } });
      if (!target) throw new SafeRoleUpdateError("目标用户不存在或已被删除。");
      if (target.role === parsed.data.role) return;
      if (target.role === "ADMIN" && parsed.data.role === "USER") {
        const admins = await transaction.profile.count({ where: { role: "ADMIN" } });
        if (admins <= 1) throw new SafeRoleUpdateError("至少需要保留一名管理员。" );
      }
      await transaction.profile.update({ where: { id: parsed.data.profileId }, data: { role: parsed.data.role } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof SafeRoleUpdateError) return { status: "error", message: error.message };
    return { status: "error", message: "角色更新失败；没有更改任何权限。" };
  }

  revalidatePath("/admin");
  return { status: "success", message: parsed.data.role === "ADMIN" ? "已授予管理员角色。" : "已调整为普通用户。" };
}
