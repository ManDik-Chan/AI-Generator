import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), transaction: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { updateAdminRoleAction } from "./actions";
import { performRoleChange } from "./rbac/contract";

const actorId = "d525801a-3c45-4419-93a5-3f62221e0951";
const profileId = "d525801a-3c45-4419-93a5-3f62221e0952";
const input = { profileId, requestId: "d525801a-3c45-4419-93a5-3f62221e0953", expectedRole: "USER", expectedVersion: "0", nextRole: "ADMIN" } as const;
const member = { id: profileId, platformRole: "ADMIN", roleVersion: "1" } as const;
beforeEach(() => { vi.resetAllMocks(); mocks.requireAdmin.mockResolvedValue({ user: { id: actorId } }); });

describe("role action outcome semantics", () => {
  it("returns the transaction's confirmed member", async () => {
    mocks.transaction.mockResolvedValue({ changed: true, member });
    expect(await updateAdminRoleAction(input)).toEqual({ ok: true, changed: true, member });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });
  it("rejects invalid input before starting a transaction", async () => {
    expect(await updateAdminRoleAction({ ...input, expectedVersion: undefined })).toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("sanitizes authentication failures while preserving framework redirects", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("private database detail"));
    await expect(updateAdminRoleAction(input)).rejects.toThrow("Role update outcome could not be confirmed.");
    const redirect = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    mocks.requireAdmin.mockRejectedValueOnce(redirect);
    await expect(updateAdminRoleAction(input)).rejects.toBe(redirect);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects a legacy receipt that has no version evidence", async () => {
    const db = {
      $queryRaw: vi.fn(),
      profile: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === actorId
        ? { role: "OWNER" }
        : { id: profileId, role: "ADMIN", roleVersion: 1 }) },
      platformRoleRequest: { findUnique: vi.fn().mockResolvedValue({ actorId, targetId: profileId, expectedRole: "USER", expectedVersion: null, nextRole: "ADMIN", resultVersion: null }) },
    };
    mocks.transaction.mockImplementation(async (callback) => callback(db));
    expect(await updateAdminRoleAction(input)).toEqual({ ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN", currentVersion: "1" });
  });
  it("only labels known aborted transactions unavailable", async () => {
    for (const code of ["P2034", "P2002", "P1017", "P2024"]) {
      mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("private", { code, clientVersion: "test" }));
      expect(await updateAdminRoleAction(input)).toEqual({ ok: false, code: "UNAVAILABLE" });
    }
    for (const sqlState of ["40001", "55P03"]) {
      mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("private", { code: "P2010", clientVersion: "test", meta: { code: sqlState } }));
      expect(await updateAdminRoleAction(input)).toEqual({ ok: false, code: "UNAVAILABLE" });
    }
  });
  it("does not treat an unverified commit-phase connection error as a rollback", async () => {
    const db = {
      $queryRaw: vi.fn(),
      profile: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === actorId
          ? { role: "OWNER" }
          : { id: profileId, role: "USER", roleVersion: 0 }),
        update: vi.fn().mockResolvedValue({ role: "ADMIN", roleVersion: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: profileId, role: "ADMIN", roleVersion: 1 }),
      },
      platformRoleAudit: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      platformRoleRequest: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    mocks.transaction.mockImplementation(async (callback) => {
      await callback(db);
      throw new Prisma.PrismaClientKnownRequestError("private", { code: "P1017", clientVersion: "test" });
    });
    expect(await performRoleChange(updateAdminRoleAction, input)).toEqual({ ok: false, code: "UNKNOWN_OUTCOME" });
  });
  it("does not claim a rollback when a commit acknowledgement is lost", async () => {
    mocks.transaction.mockRejectedValue(new Error("sensitive connection details"));
    await expect(updateAdminRoleAction(input)).rejects.toThrow("Role update outcome could not be confirmed.");
    expect(await performRoleChange(updateAdminRoleAction, input)).toEqual({ ok: false, code: "UNKNOWN_OUTCOME" });
  });
  it("keeps the outcome unknown if revalidation fails after the commit", async () => {
    mocks.transaction.mockResolvedValue({ changed: true, member });
    mocks.revalidatePath.mockImplementation(() => { throw new Error("private cache error"); });
    expect(await performRoleChange(updateAdminRoleAction, input)).toEqual({ ok: false, code: "UNKNOWN_OUTCOME" });
  });
});
