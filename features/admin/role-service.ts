import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { roleChangeInputSchema, type PlatformRole, type RoleChangeErrorCode } from "@/features/admin/role-contract";

type Input = z.infer<typeof roleChangeInputSchema>;
type Member = { id: string; platformRole: PlatformRole; roleVersion: string };

export class SafeRoleUpdateError extends Error {
  constructor(
    public code: RoleChangeErrorCode,
    public details?: { currentRole: PlatformRole; currentVersion: string } | { reason: "SELF" | "OWNER_PROTECTED" },
  ) { super(code); }
}

export async function changePlatformRole(prisma: PrismaClient, actorId: string, input: Input): Promise<{ changed: boolean; member: Member }> {
  let callbackCompleted = false;
  const finish = (changed: boolean, member: Member) => {
    callbackCompleted = true;
    return { changed, member };
  };
  try {
    return await prisma.$transaction(async (transaction) => {
      // Lock both rows in stable order before authorizing and checking the snapshot.
      for (const id of [...new Set([actorId, input.profileId])].sort()) {
        await transaction.$queryRaw`SELECT id FROM public.profiles WHERE id = ${id}::uuid FOR UPDATE`;
      }
      const actor = await transaction.profile.findUnique({ where: { id: actorId }, select: { role: true } });
      if (actor?.role !== "OWNER") throw new SafeRoleUpdateError("FORBIDDEN");
      const target = await transaction.profile.findUnique({ where: { id: input.profileId }, select: { id: true, role: true, roleVersion: true } });
      if (!target) throw new SafeRoleUpdateError("TARGET_NOT_FOUND");
      if (actorId === target.id) throw new SafeRoleUpdateError("TARGET_PROTECTED", { reason: "SELF" });
      if (target.role === "OWNER") throw new SafeRoleUpdateError("TARGET_PROTECTED", { reason: "OWNER_PROTECTED" });
      const member = (): Member => ({ id: target.id, platformRole: target.role, roleVersion: String(target.roleVersion) });
      const conflict = () => new SafeRoleUpdateError("ROLE_CONFLICT", { currentRole: target.role, currentVersion: String(target.roleVersion) });
      const expectedVersion = Number(input.expectedVersion);
      const previous = await transaction.platformRoleRequest.findUnique({ where: { requestId: input.requestId } });
      if (previous) {
        if (previous.actorId !== actorId || previous.targetId !== target.id || previous.expectedRole !== input.expectedRole ||
            previous.expectedVersion !== expectedVersion || previous.nextRole !== input.nextRole ||
            previous.resultVersion !== target.roleVersion || target.role !== previous.nextRole) throw conflict();
        return finish(false, member());
      }
      // Audit rows may have been written by the bootstrap runbook or an older
      // application after migration. They lack version evidence and reserve the ID.
      if (await transaction.platformRoleAudit.findUnique({ where: { requestId: input.requestId }, select: { requestId: true } })) throw conflict();
      if (target.role !== input.expectedRole || target.roleVersion !== expectedVersion) throw conflict();

      const changed = target.role !== input.nextRole;
      if (changed) {
        // Prisma returns the row after the database's BEFORE UPDATE version trigger.
        const updated = await transaction.profile.update({ where: { id: target.id }, data: { role: input.nextRole }, select: { role: true, roleVersion: true } });
        target.role = updated.role;
        target.roleVersion = updated.roleVersion;
        await transaction.platformRoleAudit.create({ data: {
          actorId, targetId: target.id, oldRole: input.expectedRole, newRole: updated.role, requestId: input.requestId,
        } });
      }
      await transaction.platformRoleRequest.create({ data: {
        requestId: input.requestId, actorId, targetId: target.id, expectedRole: input.expectedRole,
        expectedVersion, nextRole: input.nextRole, resultVersion: target.roleVersion, changed,
      } });
      // Read after all writes, still under the row lock, and fail closed if an
      // unexpected database side effect invalidates the receipt just written.
      const confirmed = await transaction.profile.findUniqueOrThrow({ where: { id: target.id }, select: { id: true, role: true, roleVersion: true } });
      if (confirmed.role !== target.role || confirmed.roleVersion !== target.roleVersion) throw new Error("Role result changed inside transaction");
      return finish(changed, { id: confirmed.id, platformRole: confirmed.role, roleVersion: String(confirmed.roleVersion) });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    // Before the callback returns, no COMMIT has been requested. Map only
    // known connection/lock errors here; after that point a lost connection
    // may have lost the commit acknowledgement and must remain unknown.
    if (!callbackCompleted) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code
        : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : undefined;
      const sqlState = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" ? error.meta?.code : undefined;
      if (["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code ?? "") || sqlState === "40001" || sqlState === "55P03") {
        throw new SafeRoleUpdateError("UNAVAILABLE");
      }
    }
    throw error;
  }
}
