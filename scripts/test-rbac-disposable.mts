/** Dedicated disposable-database test. Leaves a protected OWNER fixture; destroy the instance. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableTarget } from "./disposable-supabase.mjs";
import { changePlatformRole, SafeRoleUpdateError } from "@/features/admin/role-service";

async function main() {
  assertDisposableTarget();
  assert.equal(process.env.RBAC_DISPOSABLE_DESTROY_AFTER_TEST, "true");
  const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const other = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const owner = randomUUID(), admin = randomUUID(), user = randomUUID();
  const change = (nextRole: "ADMIN" | "USER", expectedRole: "ADMIN" | "USER", expectedVersion: string, requestId = randomUUID()) => ({ profileId: user, nextRole, expectedRole, expectedVersion, requestId });
  try {
    assert.equal(await db.profile.count({ where: { role: "OWNER" } }), 0);
    await db.profile.createMany({ data: [
      { id: owner, email: `${owner}@example.test`, role: "OWNER" },
      { id: admin, email: `${admin}@example.test`, role: "ADMIN" },
      { id: user, email: `${user}@example.test`, role: "USER" },
    ] });
    await assert.rejects(changePlatformRole(db, admin, change("ADMIN", "USER", "0")), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "FORBIDDEN");
    const first = change("ADMIN", "USER", "0"), second = change("ADMIN", "USER", "0");
    const results = await Promise.allSettled([changePlatformRole(db, owner, first), changePlatformRole(other, owner, second)]);
    assert.equal(results.filter((r) => r.status === "fulfilled" && r.value.changed).length, 1);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    assert(failure && (failure.reason?.code === "P2034" || failure.reason?.code === "P2002" || (failure.reason instanceof SafeRoleUpdateError && ["ROLE_CONFLICT", "UNAVAILABLE"].includes(failure.reason.code))));
    const winner = results[0].status === "fulfilled" ? first : second;
    assert.deepEqual(await changePlatformRole(db, owner, winner), { changed: false, member: { id: user, platformRole: "ADMIN", roleVersion: "1" } });
    await changePlatformRole(db, owner, change("USER", "ADMIN", "1"));
    await changePlatformRole(db, owner, change("ADMIN", "USER", "2"));
    await assert.rejects(changePlatformRole(db, owner, winner), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "ROLE_CONFLICT" && "currentVersion" in (e.details ?? {}) && e.details?.currentVersion === "3");
    assert.equal(await db.platformRoleAudit.count({ where: { targetId: user } }), 3);
    // An audit written by older code after migration has no version receipt.
    const legacy = change("USER", "ADMIN", "3");
    await db.platformRoleAudit.create({ data: { actorId: owner, targetId: user, oldRole: "ADMIN", newRole: "USER", requestId: legacy.requestId } });
    await assert.rejects(changePlatformRole(db, owner, legacy), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "ROLE_CONFLICT");
    assert.deepEqual(await db.profile.findUniqueOrThrow({ where: { id: user }, select: { role: true, roleVersion: true } }), { role: "ADMIN", roleVersion: 3 });
    // A historical ADMIN-authored request must not bypass a later revocation.
    const adminLegacy = change("USER", "ADMIN", "3");
    await db.platformRoleAudit.create({ data: { actorId: admin, targetId: user, oldRole: "ADMIN", newRole: "USER", requestId: adminLegacy.requestId } });
    await changePlatformRole(db, owner, { profileId: admin, nextRole: "USER", expectedRole: "ADMIN", expectedVersion: "0", requestId: randomUUID() });
    await assert.rejects(changePlatformRole(other, admin, adminLegacy), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "FORBIDDEN");
    await assert.rejects(changePlatformRole(other, admin, change("USER", "ADMIN", "3")), (e: unknown) => e instanceof SafeRoleUpdateError && e.code === "FORBIDDEN");
    await assert.rejects(db.profile.update({ where: { id: owner }, data: { role: "USER" } }));
    console.log("RBAC real transactions verified: concurrency, versioned replay and ABA, ADMIN denial, audit, owner protection.");
  } finally { await Promise.all([db.$disconnect(), other.$disconnect()]); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
