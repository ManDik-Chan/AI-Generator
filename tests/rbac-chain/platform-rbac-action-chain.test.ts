/*
 * Real platform-role request chain. Runs only inside scripts/test-rbac-action-chain-disposable.mjs
 * on a freshly reset, loopback-only disposable Supabase; in every other run it is skipped.
 *
 * Only the Next.js request context is replaced: cookies() returns the real Supabase session
 * cookies of the acting identity (from a real password sign-in), and revalidatePath is recorded.
 * Session validation (Auth /user and auth.sessions), requireAdmin(), the role-change Server
 * Action with crafted request objects, the serializable transaction, the database triggers, the audit
 * table and the /admin directory loader all run for real.
 *
 * Fixtures are left in place: the OWNER is protected by design and the instance is destroyed.
 */
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ cookies: [] as Array<{ name: string; value: string }>, revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => request.cookies.map((cookie) => ({ ...cookie })),
    get: (name: string) => request.cookies.find((cookie) => cookie.name === name),
    has: (name: string) => request.cookies.some((cookie) => cookie.name === name),
    set: () => undefined,
    delete: () => undefined,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: request.revalidatePath }));

import { updateAdminRoleAction } from "@/features/admin/actions";
import { getAdminOverview } from "@/features/admin/data";
import { interpretDirectoryLoad, performRoleChange } from "@/features/admin/rbac/contract";
import { loadPlatformDirectoryAction } from "@/features/admin/rbac/directory-action";
import { toPlatformDirectory } from "@/features/admin/rbac/server-directory";
import { prisma } from "@/lib/database/prisma";

const enabled = process.env.RBAC_ACTION_CHAIN_DISPOSABLE === "true";
const url = process.env.SUPABASE_TEST_URL?.trim();
const anonKey = process.env.SUPABASE_TEST_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY?.trim();
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (enabled) {
  if (!url || !anonKey || !serviceKey || !databaseUrl) throw new Error("The platform role chain requires the disposable Supabase environment.");
  const loopback = ["localhost", "127.0.0.1", "[::1]"];
  if (![url, databaseUrl].every((value) => loopback.includes(new URL(value).hostname))) throw new Error("The platform role chain accepts loopback endpoints only.");
  if (process.env.DATABASE_URL !== databaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL !== url || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== anonKey) {
    throw new Error("The application under test must use the same disposable database and Auth as the fixtures.");
  }
}

const people = ["owner", "adminA", "adminB", "userC", "userD", "userE", "userF", "userG", "userH", "userI"] as const;
type Person = (typeof people)[number];
type Actor = Person | "signedOut" | "forged";

describe.skipIf(!enabled)("platform role request chain with real sessions", () => {
  let db: PrismaClient;
  const ids = {} as Record<Person, string>;
  const sessions = {} as Record<Person, Array<{ name: string; value: string }>>;
  const password = `Rbac!${randomUUID()}a9`;

  function actAs(actor: Actor) {
    if (actor === "signedOut") request.cookies = [];
    else if (actor === "forged") request.cookies = sessions.owner.map((cookie) => ({ name: cookie.name, value: `base64-${Buffer.from("{\"access_token\":\"forged\"}").toString("base64url")}` }));
    else request.cookies = sessions[actor];
  }

  async function change(actor: Actor, fields: Record<string, string | undefined>) {
    actAs(actor);
    return updateAdminRoleAction({ expectedVersion: "0", ...fields });
  }

  async function redirectOf(work: Promise<unknown>) {
    try {
      await work;
    } catch (error) {
      const digest = (error as { digest?: unknown }).digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
      throw error;
    }
    throw new Error("Expected the request to be redirected");
  }

  const roleOf = async (person: Person) => (await db.profile.findUniqueOrThrow({ where: { id: ids[person] }, select: { role: true } })).role;
  const auditsFor = (person: Person) => db.platformRoleAudit.findMany({ where: { targetId: ids[person] }, orderBy: { createdAt: "asc" } });

  async function loadDirectory(actor: Actor) {
    actAs(actor);
    const result = toPlatformDirectory(await getAdminOverview());
    if (!result.ok) throw new Error(result.issues.join("\n"));
    return result.value;
  }

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: databaseUrl });
    expect(await db.profile.count({ where: { role: "OWNER" } }), "the chain starts from a reset database").toBe(0);
    const service = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const person of people) {
      const email = `rbac-chain-${person.toLowerCase()}-${randomUUID()}@example.test`;
      const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
      expect(made.error).toBeNull();
      ids[person] = made.data.user!.id;
      // Real password sign-in through the SSR client, capturing the cookies the app would receive.
      let jar: Array<{ name: string; value: string }> = [];
      const client = createServerClient(url!, anonKey!, {
        cookies: {
          getAll: () => jar,
          setAll: (items) => {
            for (const { name, value } of items) jar = [...jar.filter((cookie) => cookie.name !== name), ...(value ? [{ name, value }] : [])];
          },
        },
      });
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      expect(jar.length).toBeGreaterThan(0);
      sessions[person] = jar;
    }
    await db.profile.updateMany({ where: { id: { in: [ids.adminA, ids.adminB] } }, data: { role: "ADMIN" } });
    await db.profile.update({ where: { id: ids.owner }, data: { role: "OWNER" } });
    expect(await db.platformRoleAudit.count()).toBe(0);
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(() => {
    request.revalidatePath.mockClear();
  });

  it("lets the OWNER grant and revoke ADMIN, auditing each applied change once", async () => {
    const grant = randomUUID();
    await expect(change("owner", { profileId: ids.userC, nextRole: "ADMIN", expectedRole: "USER", requestId: grant })).resolves.toEqual({ ok: true, changed: true, member: { id: ids.userC, platformRole: "ADMIN", roleVersion: "1" } });
    expect(await roleOf("userC")).toBe("ADMIN");
    expect(request.revalidatePath).toHaveBeenCalledWith("/admin");
    const revoke = randomUUID();
    await expect(change("owner", { profileId: ids.userC, nextRole: "USER", expectedRole: "ADMIN", expectedVersion: "1", requestId: revoke })).resolves.toEqual({ ok: true, changed: true, member: { id: ids.userC, platformRole: "USER", roleVersion: "2" } });
    expect(await roleOf("userC")).toBe("USER");
    expect((await auditsFor("userC")).map(({ actorId, oldRole, newRole, requestId }) => ({ actorId, oldRole, newRole, requestId }))).toEqual([
      { actorId: ids.owner, oldRole: "USER", newRole: "ADMIN", requestId: grant },
      { actorId: ids.owner, oldRole: "ADMIN", newRole: "USER", requestId: revoke },
    ]);
  });

  it("applies a repeated request once and rejects a reused request id for different content", async () => {
    const requestId = randomUUID();
    const fields = { profileId: ids.userF, nextRole: "ADMIN", expectedRole: "USER", requestId };
    await expect(change("owner", fields)).resolves.toEqual({ ok: true, changed: true, member: { id: ids.userF, platformRole: "ADMIN", roleVersion: "1" } });
    await expect(change("owner", fields)).resolves.toEqual({ ok: true, changed: false, member: { id: ids.userF, platformRole: "ADMIN", roleVersion: "1" } });
    expect(await auditsFor("userF")).toHaveLength(1);
    await expect(change("owner", { ...fields, profileId: ids.userD })).resolves.toMatchObject({ ok: false, code: "ROLE_CONFLICT", currentRole: "USER", currentVersion: "0" });
    expect(await roleOf("userD")).toBe("USER");
    expect(await auditsFor("userD")).toHaveLength(0);
    await change("owner", { profileId: ids.userF, nextRole: "USER", expectedRole: "ADMIN", expectedVersion: "1", requestId: randomUUID() });
    await change("owner", { profileId: ids.userF, nextRole: "ADMIN", expectedRole: "USER", expectedVersion: "2", requestId: randomUUID() });
    await expect(change("owner", fields)).resolves.toEqual({ ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN", currentVersion: "3" });
    expect(await auditsFor("userF")).toHaveLength(3);
  });

  it("binds no-op request IDs to the full intent without creating an audit", async () => {
    const fields = { profileId: ids.userD, nextRole: "USER", expectedRole: "USER", requestId: randomUUID() };
    const result = { ok: true, changed: false, member: { id: ids.userD, platformRole: "USER", roleVersion: "0" } };
    await expect(change("owner", fields)).resolves.toEqual(result);
    await expect(change("owner", fields)).resolves.toEqual(result);
    await expect(change("owner", { ...fields, nextRole: "ADMIN" })).resolves.toMatchObject({ ok: false, code: "ROLE_CONFLICT", currentRole: "USER", currentVersion: "0" });
    expect(await auditsFor("userD")).toHaveLength(0);
    await expect(change("owner", { ...fields, profileId: randomUUID(), requestId: randomUUID() })).resolves.toEqual({ ok: false, code: "TARGET_NOT_FOUND" });
  });

  it("reports a lost commit acknowledgement as unknown, then reconciles the same request", async () => {
    const fields = { profileId: ids.userG, nextRole: "ADMIN" as const, expectedRole: "USER" as const, expectedVersion: "0", requestId: randomUUID() };
    actAs("owner");
    const transaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (...args: Parameters<typeof transaction>) => {
      await transaction(...args);
      throw new Error("simulated lost commit acknowledgement");
    }) as unknown as typeof prisma.$transaction);
    try {
      expect(await performRoleChange(updateAdminRoleAction, fields)).toEqual({ ok: false, code: "UNKNOWN_OUTCOME" });
    } finally { spy.mockRestore(); }
    expect(await roleOf("userG")).toBe("ADMIN");
    expect(await auditsFor("userG")).toHaveLength(1);
    await expect(change("owner", fields)).resolves.toEqual({ ok: true, changed: false, member: { id: ids.userG, platformRole: "ADMIN", roleVersion: "1" } });
  });

  it("rolls the role, version, audit and receipt back together when audit insertion fails", async () => {
    const requestId = randomUUID();
    await db.$executeRawUnsafe(`CREATE FUNCTION public.rbac_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER rbac_test_fail_audit BEFORE INSERT ON public.platform_role_audits FOR EACH ROW EXECUTE FUNCTION public.rbac_test_fail_audit()`);
    try {
      await expect(change("owner", { profileId: ids.userH, nextRole: "ADMIN", expectedRole: "USER", requestId })).rejects.toThrow("Role update outcome could not be confirmed.");
      expect(await db.profile.findUniqueOrThrow({ where: { id: ids.userH }, select: { role: true, roleVersion: true } })).toEqual({ role: "USER", roleVersion: 0 });
      expect(await auditsFor("userH")).toHaveLength(0);
      expect(await db.platformRoleRequest.findUnique({ where: { requestId } })).toBeNull();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER rbac_test_fail_audit ON public.platform_role_audits`);
      await db.$executeRawUnsafe(`DROP FUNCTION public.rbac_test_fail_audit()`);
    }
  });

  it("rejects a stale expected role without writing", async () => {
    await expect(change("owner", { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "ROLE_CONFLICT", currentRole: "USER", currentVersion: "0" });
    await expect(change("owner", { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "USER", expectedVersion: "1", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "ROLE_CONFLICT", currentRole: "USER", currentVersion: "0" });
    expect(await roleOf("userD")).toBe("USER");
    expect(await auditsFor("userD")).toHaveLength(0);
    expect(request.revalidatePath).not.toHaveBeenCalled();
  });

  it("commits exactly one of two concurrent OWNER requests for the same member", async () => {
    const requestIds = [randomUUID(), randomUUID()];
    const results = await Promise.all(requestIds.map((requestId) => change("owner", { profileId: ids.userE, nextRole: "ADMIN", expectedRole: "USER", requestId })));
    expect(results.filter((result) => result.ok && result.changed)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && ["ROLE_CONFLICT", "UNAVAILABLE"].includes(result.code))).toHaveLength(1);
    expect(await roleOf("userE")).toBe("ADMIN");
    expect(await auditsFor("userE")).toHaveLength(1);
    const loser = results.findIndex((result) => !result.ok);
    expect(await db.platformRoleRequest.findUnique({ where: { requestId: requestIds[loser] } })).toBeNull();
  });

  it("applies concurrent copies of one request at most once and reconciles its receipt", async () => {
    const fields = { profileId: ids.userI, nextRole: "ADMIN", expectedRole: "USER", requestId: randomUUID() };
    const results = await Promise.all([change("owner", fields), change("owner", fields)]);
    expect(results.filter((result) => result.ok && result.changed)).toHaveLength(1);
    expect(results.filter((result) => result.ok && !result.changed || !result.ok && result.code === "UNAVAILABLE")).toHaveLength(1);
    await expect(change("owner", fields)).resolves.toEqual({ ok: true, changed: false, member: { id: ids.userI, platformRole: "ADMIN", roleVersion: "1" } });
    expect(await auditsFor("userI")).toHaveLength(1);
    expect(await db.platformRoleRequest.count({ where: { requestId: fields.requestId } })).toBe(1);
  });

  it("denies every crafted ADMIN request, including against the OWNER, a peer and itself", async () => {
    await expect(change("adminA", { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "USER", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    await expect(change("adminA", { profileId: ids.adminB, nextRole: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    await expect(change("adminA", { profileId: ids.owner, nextRole: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    await expect(change("adminA", { profileId: ids.adminA, nextRole: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "FORBIDDEN" });
    await expect(change("adminA", { profileId: ids.adminA, nextRole: "OWNER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect([await roleOf("adminA"), await roleOf("adminB"), await roleOf("owner"), await roleOf("userD")]).toEqual(["ADMIN", "ADMIN", "OWNER", "USER"]);
    expect(await db.platformRoleAudit.count({ where: { actorId: { in: [ids.adminA, ids.adminB] } } })).toBe(0);
  });

  it("keeps the OWNER role out of every request and protects the OWNER from itself", async () => {
    await expect(change("owner", { profileId: ids.owner, nextRole: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ ok: false, code: "TARGET_PROTECTED", reason: "SELF" });
    for (const fields of [
      { profileId: ids.userD, nextRole: "OWNER", expectedRole: "USER", requestId: randomUUID() },
      { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "OWNER", requestId: randomUUID() },
      { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "USER", requestId: undefined },
      { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "USER", requestId: "not-a-uuid" },
      { profileId: "not-a-uuid", nextRole: "ADMIN", expectedRole: "USER", requestId: randomUUID() },
    ]) {
      await expect(change("owner", fields)).resolves.toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    }
    expect([await roleOf("owner"), await roleOf("userD")]).toEqual(["OWNER", "USER"]);
  });

  it("redirects USER, signed-out and forged sessions before any role logic runs", async () => {
    const fields = { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "USER", requestId: randomUUID() };
    await expect(redirectOf(change("userD", fields))).resolves.toBe("/workspace");
    await expect(redirectOf(change("signedOut", fields))).resolves.toBe("/login");
    await expect(redirectOf(change("forged", fields))).resolves.toBe("/login");
    expect(await roleOf("userD")).toBe("USER");
    expect(await auditsFor("userD")).toHaveLength(0);
  });

  it("loads the /admin directory from the viewer's own server-side rights", async () => {
    const owner = await loadDirectory("owner");
    expect(owner.viewer).toEqual({ id: ids.owner, platformRole: "OWNER", capabilities: { manageRoles: true, viewRoleAudit: false } });
    const ownerRow = (person: Person) => owner.members.find((member) => member.id === ids[person])!;
    expect(ownerRow("owner")).toMatchObject({ isViewer: true, platformRole: "OWNER", roleChange: { restriction: "SELF" } });
    expect(ownerRow("adminA").platformRole).toBe("ADMIN");
    expect(ownerRow("owner").roleVersion).toBe("1");
    expect(ownerRow("userC")).toMatchObject({ roleVersion: "2", roleChange: { assignableRoles: ["ADMIN"] } });
    expect(ownerRow("adminA").roleVersion).toBe("1");

    const admin = await loadDirectory("adminA");
    expect(admin.viewer).toEqual({ id: ids.adminA, platformRole: "ADMIN", capabilities: { manageRoles: false, viewRoleAudit: false } });
    const adminRow = (person: Person) => admin.members.find((member) => member.id === ids[person])!.roleChange.restriction;
    expect([adminRow("owner"), adminRow("adminA"), adminRow("adminB"), adminRow("userD")]).toEqual(["OWNER_PROTECTED", "SELF", "PEER_ADMIN", "INSUFFICIENT_ROLE"]);
    expect(JSON.stringify(admin)).not.toMatch(/_count|updatedAt|avatarUrl|memoryEnabled/);

    await expect(redirectOf(loadDirectory("userD"))).resolves.toBe("/workspace");
    await expect(redirectOf(loadDirectory("signedOut"))).resolves.toBe("/login");
  });

  it("serves the same directory through the loader action, behind the same guard", async () => {
    actAs("owner");
    const owner = interpretDirectoryLoad(await loadPlatformDirectoryAction());
    expect(owner?.viewer).toEqual({ id: ids.owner, platformRole: "OWNER", capabilities: { manageRoles: true, viewRoleAudit: false } });
    expect(owner?.members.find((member) => member.id === ids.userC)).toMatchObject({ roleVersion: "2", roleChange: { assignableRoles: ["ADMIN"] } });
    expect(Number.isNaN(Date.parse(owner?.generatedAt ?? ""))).toBe(false);

    actAs("adminA");
    const admin = interpretDirectoryLoad(await loadPlatformDirectoryAction());
    expect(admin?.viewer).toEqual({ id: ids.adminA, platformRole: "ADMIN", capabilities: { manageRoles: false, viewRoleAudit: false } });
    expect(admin?.members.every((member) => member.roleChange.assignableRoles.length === 0)).toBe(true);
    expect(JSON.stringify(admin)).not.toMatch(/_count|updatedAt|avatarUrl|memoryEnabled/);

    actAs("userD");
    await expect(redirectOf(loadPlatformDirectoryAction())).resolves.toBe("/workspace");
    actAs("signedOut");
    await expect(redirectOf(loadPlatformDirectoryAction())).resolves.toBe("/login");
  });

  it("revokes an ADMIN's access on the very next request", async () => {
    await expect(change("owner", { profileId: ids.adminB, nextRole: "USER", expectedRole: "ADMIN", expectedVersion: "1", requestId: randomUUID() })).resolves.toMatchObject({ ok: true, changed: true, member: { id: ids.adminB, platformRole: "USER", roleVersion: "2" } });
    await expect(redirectOf(change("adminB", { profileId: ids.userD, nextRole: "ADMIN", expectedRole: "USER", requestId: randomUUID() }))).resolves.toBe("/workspace");
    await expect(redirectOf(loadDirectory("adminB"))).resolves.toBe("/workspace");
    expect(await roleOf("userD")).toBe("USER");
  });

  it("audits exactly the applied changes, all made by the OWNER", async () => {
    const audits = await db.platformRoleAudit.findMany();
    // userC grant + revoke, userF grant/revoke/grant, userG/I/E grants, adminB revoke.
    expect(audits).toHaveLength(9);
    expect(audits.every((audit) => audit.actorId === ids.owner)).toBe(true);
    expect(new Set(audits.map((audit) => audit.requestId)).size).toBe(9);
    expect(audits.map((audit) => audit.targetId).sort()).toEqual([ids.userC, ids.userC, ids.userF, ids.userF, ids.userF, ids.userG, ids.userI, ids.userE, ids.adminB].sort());
  });
});
