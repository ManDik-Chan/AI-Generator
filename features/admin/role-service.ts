import "server-only";
import type { PrismaClient } from "@prisma/client";
import { canChangePlatformRole, type PlatformRole, type RoleChangeErrorCode } from "@/features/admin/role-contract";

export class SafeRoleUpdateError extends Error {
  constructor(public code: RoleChangeErrorCode, message: string) { super(message); }
}

type Input = { profileId: string; role: "ADMIN" | "USER"; expectedRole: "ADMIN" | "USER"; requestId: string };
export async function changePlatformRole(prisma: PrismaClient, actorId: string, input: Input) {
  return prisma.$transaction(async (transaction) => {
      // Lock in stable order before reading either role. A concurrent revocation must
      // commit before this transaction can authorize, or wait until this write commits.
      const ids = [...new Set([actorId, input.profileId])].sort();
      for (const id of ids) {
        await transaction.$queryRaw`SELECT id FROM public.profiles WHERE id = ${id}::uuid FOR UPDATE`;
      }
      const actor = await transaction.profile.findUnique({ where: { id: actorId }, select: { role: true } });
      const target = await transaction.profile.findUnique({ where: { id: input.profileId }, select: { role: true } });
      if (!actor) throw new SafeRoleUpdateError("FORBIDDEN", "当前账户没有管理权限。");
      if (!target) throw new SafeRoleUpdateError("NOT_FOUND", "目标用户不存在或已被删除。");
      const decision = canChangePlatformRole(actor.role as PlatformRole, target.role as PlatformRole, actorId === input.profileId);
      if (!decision.allowed) throw new SafeRoleUpdateError(decision.code, decision.reason);
      const previous = await transaction.platformRoleAudit.findUnique({ where: { requestId: input.requestId } });
      if (previous) {
        if (previous.actorId !== actorId || previous.targetId !== input.profileId || previous.oldRole !== input.expectedRole || previous.newRole !== input.role) {
          throw new SafeRoleUpdateError("CONFLICT", "请求编号已使用，请刷新后重试。");
        }
        return false;
      }
      if (target.role !== input.expectedRole) throw new SafeRoleUpdateError("CONFLICT", "目标角色已变化，请刷新后重试。");
      if (target.role === input.role) return false;
      await transaction.profile.update({ where: { id: input.profileId }, data: { role: input.role } });
      await transaction.platformRoleAudit.create({ data: {
        actorId: actorId, targetId: input.profileId, oldRole: target.role,
        newRole: input.role, requestId: input.requestId,
      } });
      return true;
  }, { isolationLevel: "Serializable" });
}
