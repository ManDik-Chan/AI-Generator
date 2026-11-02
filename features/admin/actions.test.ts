import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), transaction: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { updateAdminRoleAction } from "./actions";

const actorId = "d525801a-3c45-4419-93a5-3f62221e0951";
const targetId = "d525801a-3c45-4419-93a5-3f62221e0952";
const requestId = "d525801a-3c45-4419-93a5-3f62221e0953";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ profileId: targetId, requestId, expectedRole: "USER", role: "ADMIN" })) data.set(key, value);
  return data;
}
function tx(actorRole: string, targetRole: string, previous: unknown = null) {
  return {
    $queryRaw: vi.fn(),
    profile: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ role: where.id === actorId ? actorRole : targetRole })), update: vi.fn() },
    platformRoleAudit: { findUnique: vi.fn(async () => previous), create: vi.fn() },
  };
}
const idle = { status: "idle", message: "" } as const;
beforeEach(() => { vi.clearAllMocks(); mocks.requireAdmin.mockResolvedValue({ user: { id: actorId } }); });
describe("role change transaction", () => {
  it("writes and audits a permitted change", async () => {
    const db = tx("OWNER", "USER");
    mocks.transaction.mockImplementation(async (fn) => fn(db));
    expect((await updateAdminRoleAction(idle, form())).status).toBe("success");
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(db.profile.update).toHaveBeenCalledOnce();
    expect(db.platformRoleAudit.create).toHaveBeenCalledOnce();
  });
  it("rejects a revoked actor based on the transaction read", async () => {
    const db = tx("USER", "USER");
    mocks.transaction.mockImplementation(async (fn) => fn(db));
    expect((await updateAdminRoleAction(idle, form())).code).toBe("FORBIDDEN");
    expect(db.profile.update).not.toHaveBeenCalled();
  });
  it("prevents stale requests and makes committed replays no-ops", async () => {
    const stale = tx("OWNER", "ADMIN");
    mocks.transaction.mockImplementation(async (fn) => fn(stale));
    expect((await updateAdminRoleAction(idle, form())).code).toBe("CONFLICT");
    expect(stale.profile.update).not.toHaveBeenCalled();
    const replay = tx("OWNER", "USER", { actorId, targetId, oldRole: "USER", newRole: "ADMIN" });
    mocks.transaction.mockImplementation(async (fn) => fn(replay));
    expect((await updateAdminRoleAction(idle, form())).status).toBe("success");
    expect(replay.profile.update).not.toHaveBeenCalled();
    expect(replay.platformRoleAudit.create).not.toHaveBeenCalled();
  });
});
