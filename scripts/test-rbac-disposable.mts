/** Dedicated disposable-database test. Leaves a protected OWNER fixture; destroy the local instance afterward. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableTarget } from "./disposable-supabase.mjs";
import { changePlatformRole, SafeRoleUpdateError } from "@/features/admin/role-service";

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  assertDisposableTarget();
  assert.equal(process.env.RBAC_DISPOSABLE_DESTROY_AFTER_TEST, "true", "Test leaves an OWNER fixture and requires destruction of the disposable instance");
  assert(url);
  const db = new PrismaClient({ datasourceUrl: url });
  const other = new PrismaClient({ datasourceUrl: url });
  const owner = randomUUID(), admin = randomUUID(), user = randomUUID();
  const change = (role: "ADMIN" | "USER", expectedRole: "ADMIN" | "USER", requestId = randomUUID()) => ({ profileId: user, role, expectedRole, requestId });
  try {
    assert.equal(await db.profile.count({ where: { role: "OWNER" } }), 0, "must start with no owner");
    await db.profile.createMany({ data: [
      { id: owner, email: `${owner}@example.test`, role: "OWNER" },
      { id: admin, email: `${admin}@example.test`, role: "ADMIN" },
      { id: user, email: `${user}@example.test`, role: "USER" },
    ] });
    await assert.rejects(changePlatformRole(db, admin, change("ADMIN", "USER")), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "FORBIDDEN");
    const first = change("ADMIN", "USER");
    const second = change("ADMIN", "USER");
    const results = await Promise.allSettled([changePlatformRole(db, owner, first), changePlatformRole(other, owner, second)]);
    assert.equal(results.filter((r) => r.status === "fulfilled" && r.value).length, 1, "exactly one concurrent update commits");
    assert.equal(results.filter((r) => r.status === "rejected").length, 1, "other update must fail safely");
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    const error = failure.reason as { code?: string; meta?: { code?: string }; message?: string };
    assert(error.code === "P2034" || error.code === "40001" || error.meta?.code === "40001" || (error instanceof SafeRoleUpdateError && error.code === "CONFLICT"), `unexpected concurrent failure: ${String(error)}`);
    const winner = results[0].status === "fulfilled" ? first : second;
    assert.equal(await db.platformRoleAudit.count({ where: { targetId: user } }), 1);
    assert.equal(await changePlatformRole(db, owner, winner), false, "committed request replay is a no-op");
    await changePlatformRole(db, owner, change("USER", "ADMIN"));
    assert.equal(await changePlatformRole(db, owner, winner), false, "old replay does not undo a later change");
    assert.equal((await db.profile.findUniqueOrThrow({ where: { id: user } })).role, "USER");
    // Simulate an older, committed ADMIN request from before this policy was deployed.
    // Current ADMINs never have role-write permission; this is a historical audit fixture.
    const historical = change("ADMIN", "USER");
    await db.platformRoleAudit.create({ data: { actorId: admin, targetId: user, oldRole: historical.expectedRole, newRole: historical.role, requestId: historical.requestId } });
    await changePlatformRole(db, owner, { profileId: admin, role: "USER", expectedRole: "ADMIN", requestId: randomUUID() });
    await assert.rejects(changePlatformRole(other, admin, historical), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "FORBIDDEN");
    await assert.rejects(changePlatformRole(other, admin, change("ADMIN", "USER")), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "FORBIDDEN");
    await assert.rejects(db.profile.update({ where: { id: owner }, data: { role: "USER" } }));
    assert.equal(await db.platformRoleAudit.count({ where: { actorId: owner } }), 3);
    console.log("RBAC real transaction tests passed: concurrency, replays, ADMIN denial after revocation, audit, owner protection. ADMIN cannot write roles even before revocation; this is not an OWNER revocation race.");
  } finally {
    await Promise.all([db.$disconnect(), other.$disconnect()]);
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
