"use server";

import { revalidatePath } from "next/cache";

import { canChangePlatformRole, roleChangeInputSchema, type PlatformRole, type RoleChangeErrorCode } from "@/features/admin/role-contract";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";


export interface AdminRoleActionState {
  status: "idle" | "success" | "error";
  message: string;
  code?: RoleChangeErrorCode;
}

class SafeRoleUpdateError extends Error {
  constructor(public code: RoleChangeErrorCode, message: string) { super(message); }
}

export async function updateAdminRoleAction(
  _previous: AdminRoleActionState,
  formData: FormData,
): Promise<AdminRoleActionState> {
  const { user } = await requireAdmin();
  const parsed = roleChangeInputSchema.safeParse({ profileId: formData.get("profileId"), role: formData.get("role"), expectedRole: formData.get("expectedRole"), requestId: formData.get("requestId") });
  if (!parsed.success) return { status: "error", code: "INVALID_REQUEST", message: "角色请求无效，请刷新后重试。" };

  try {
    const changed = await prisma.$transaction(async (transaction) => {
      // Lock in stable order before reading either role. A concurrent revocation must
      // commit before this transaction can authorize, or wait until this write commits.
      const ids = [...new Set([user.id, parsed.data.profileId])].sort();
      for (const id of ids) {
        await transaction.$queryRaw`SELECT id FROM public.profiles WHERE id = ${id}::uuid FOR UPDATE`;
      }
      const actor = await transaction.profile.findUnique({ where: { id: user.id }, select: { role: true } });
      const target = await transaction.profile.findUnique({ where: { id: parsed.data.profileId }, select: { role: true } });
      if (!actor) throw new SafeRoleUpdateError("FORBIDDEN", "当前账户没有管理权限。");
      if (!target) throw new SafeRoleUpdateError("NOT_FOUND", "目标用户不存在或已被删除。");
      const decision = canChangePlatformRole(actor.role as PlatformRole, target.role as PlatformRole, user.id === parsed.data.profileId);
      if (!decision.allowed) throw new SafeRoleUpdateError(decision.code, decision.reason);
      const previous = await transaction.platformRoleAudit.findUnique({ where: { requestId: parsed.data.requestId } });
      if (previous) {
        if (previous.actorId !== user.id || previous.targetId !== parsed.data.profileId || previous.oldRole !== parsed.data.expectedRole || previous.newRole !== parsed.data.role) {
          throw new SafeRoleUpdateError("CONFLICT", "请求编号已使用，请刷新后重试。");
        }
        return false;
      }
      if (target.role !== parsed.data.expectedRole) throw new SafeRoleUpdateError("CONFLICT", "目标角色已变化，请刷新后重试。");
      if (target.role === parsed.data.role) return false;
      await transaction.profile.update({ where: { id: parsed.data.profileId }, data: { role: parsed.data.role } });
      await transaction.platformRoleAudit.create({ data: {
        actorId: user.id, targetId: parsed.data.profileId, oldRole: target.role,
        newRole: parsed.data.role, requestId: parsed.data.requestId,
      } });
      return true;
    }, { isolationLevel: "Serializable" });
    revalidatePath("/admin");
    return { status: "success", message: changed ? "平台角色已更新。" : "平台角色未发生变化。" };
  } catch (error) {
    if (error instanceof SafeRoleUpdateError) return { status: "error", code: error.code, message: error.message };
    return { status: "error", code: "CONFLICT", message: "角色更新失败；请刷新后重试。" };
  }
}
