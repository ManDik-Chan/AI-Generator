/*
 * Real platform-role request chain. Runs only inside scripts/test-rbac-action-chain-disposable.mjs
 * on a freshly reset, loopback-only disposable Supabase; in every other run it is skipped.
 *
 * Only the Next.js request context is replaced: cookies() returns the real Supabase session
 * cookies of the acting identity (from a real password sign-in), and revalidatePath is recorded.
 * Session validation (Auth /user and auth.sessions), requireAdmin(), the role-change Server
 * Action with crafted FormData, the serializable transaction, the database triggers, the audit
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

import { updateAdminRoleAction, type AdminRoleActionState } from "@/features/admin/actions";
import { getAdminOverview } from "@/features/admin/data";
import { toPlatformDirectory } from "@/features/admin/rbac/server-directory";

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

const people = ["owner", "adminA", "adminB", "userC", "userD", "userE", "userF"] as const;
type Person = (typeof people)[number];
type Actor = Person | "signedOut" | "forged";
const idle: AdminRoleActionState = { status: "idle", message: "" };

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
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, value);
    return updateAdminRoleAction(idle, form);
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
    await expect(change("owner", { profileId: ids.userC, role: "ADMIN", expectedRole: "USER", requestId: grant })).resolves.toEqual({ status: "success", message: "平台角色已更新。" });
    expect(await roleOf("userC")).toBe("ADMIN");
    expect(request.revalidatePath).toHaveBeenCalledWith("/admin");
    const revoke = randomUUID();
    await expect(change("owner", { profileId: ids.userC, role: "USER", expectedRole: "ADMIN", requestId: revoke })).resolves.toMatchObject({ status: "success", message: "平台角色已更新。" });
    expect(await roleOf("userC")).toBe("USER");
    expect((await auditsFor("userC")).map(({ actorId, oldRole, newRole, requestId }) => ({ actorId, oldRole, newRole, requestId }))).toEqual([
      { actorId: ids.owner, oldRole: "USER", newRole: "ADMIN", requestId: grant },
      { actorId: ids.owner, oldRole: "ADMIN", newRole: "USER", requestId: revoke },
    ]);
  });

  it("applies a repeated request once and rejects a reused request id for different content", async () => {
    const requestId = randomUUID();
    const fields = { profileId: ids.userF, role: "ADMIN", expectedRole: "USER", requestId };
    await expect(change("owner", fields)).resolves.toEqual({ status: "success", message: "平台角色已更新。" });
    await expect(change("owner", fields)).resolves.toEqual({ status: "success", message: "平台角色未发生变化。" });
    expect(await auditsFor("userF")).toHaveLength(1);
    await expect(change("owner", { ...fields, profileId: ids.userD })).resolves.toMatchObject({ status: "error", code: "CONFLICT" });
    expect(await roleOf("userD")).toBe("USER");
    expect(await auditsFor("userD")).toHaveLength(0);
  });

  it("rejects a stale expected role without writing", async () => {
    await expect(change("owner", { profileId: ids.userD, role: "ADMIN", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ status: "error", code: "CONFLICT" });
    expect(await roleOf("userD")).toBe("USER");
    expect(await auditsFor("userD")).toHaveLength(0);
    expect(request.revalidatePath).not.toHaveBeenCalled();
  });

  it("commits exactly one of two concurrent OWNER requests for the same member", async () => {
    const results = await Promise.all([randomUUID(), randomUUID()].map((requestId) => change("owner", { profileId: ids.userE, role: "ADMIN", expectedRole: "USER", requestId })));
    expect(results.filter((result) => result.status === "success" && result.message === "平台角色已更新。")).toHaveLength(1);
    expect(results.filter((result) => result.status === "error" && result.code === "CONFLICT")).toHaveLength(1);
    expect(await roleOf("userE")).toBe("ADMIN");
    expect(await auditsFor("userE")).toHaveLength(1);
  });

  it("denies every crafted ADMIN request, including against the OWNER, a peer and itself", async () => {
    await expect(change("adminA", { profileId: ids.userD, role: "ADMIN", expectedRole: "USER", requestId: randomUUID() })).resolves.toMatchObject({ status: "error", code: "FORBIDDEN" });
    await expect(change("adminA", { profileId: ids.adminB, role: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ status: "error", code: "FORBIDDEN" });
    await expect(change("adminA", { profileId: ids.owner, role: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ status: "error", code: "OWNER_PROTECTED" });
    await expect(change("adminA", { profileId: ids.adminA, role: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ status: "error", code: "SELF_CHANGE" });
    await expect(change("adminA", { profileId: ids.adminA, role: "OWNER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ status: "error", code: "INVALID_REQUEST" });
    expect([await roleOf("adminA"), await roleOf("adminB"), await roleOf("owner"), await roleOf("userD")]).toEqual(["ADMIN", "ADMIN", "OWNER", "USER"]);
    expect(await db.platformRoleAudit.count({ where: { actorId: { in: [ids.adminA, ids.adminB] } } })).toBe(0);
  });

  it("keeps the OWNER role out of every request and protects the OWNER from itself", async () => {
    await expect(change("owner", { profileId: ids.owner, role: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ status: "error", code: "SELF_CHANGE" });
    for (const fields of [
      { profileId: ids.userD, role: "OWNER", expectedRole: "USER", requestId: randomUUID() },
      { profileId: ids.userD, role: "ADMIN", expectedRole: "OWNER", requestId: randomUUID() },
      { profileId: ids.userD, role: "ADMIN", expectedRole: "USER", requestId: undefined },
      { profileId: ids.userD, role: "ADMIN", expectedRole: "USER", requestId: "not-a-uuid" },
      { profileId: "not-a-uuid", role: "ADMIN", expectedRole: "USER", requestId: randomUUID() },
    ]) {
      await expect(change("owner", fields)).resolves.toMatchObject({ status: "error", code: "INVALID_REQUEST" });
    }
    expect([await roleOf("owner"), await roleOf("userD")]).toEqual(["OWNER", "USER"]);
  });

  it("redirects USER, signed-out and forged sessions before any role logic runs", async () => {
    const fields = { profileId: ids.userD, role: "ADMIN", expectedRole: "USER", requestId: randomUUID() };
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
    // Role changes are paused until the backend returns a role version: nothing is offered, nothing invented.
    expect(owner.members.every((member) => member.roleVersion === null && member.roleChange.assignableRoles.length === 0)).toBe(true);

    const admin = await loadDirectory("adminA");
    expect(admin.viewer).toEqual({ id: ids.adminA, platformRole: "ADMIN", capabilities: { manageRoles: false, viewRoleAudit: false } });
    const adminRow = (person: Person) => admin.members.find((member) => member.id === ids[person])!.roleChange.restriction;
    expect([adminRow("owner"), adminRow("adminA"), adminRow("adminB"), adminRow("userD")]).toEqual(["OWNER_PROTECTED", "SELF", "PEER_ADMIN", "INSUFFICIENT_ROLE"]);
    expect(JSON.stringify(admin)).not.toMatch(/_count|updatedAt|avatarUrl|memoryEnabled/);

    await expect(redirectOf(loadDirectory("userD"))).resolves.toBe("/workspace");
    await expect(redirectOf(loadDirectory("signedOut"))).resolves.toBe("/login");
  });

  it("revokes an ADMIN's access on the very next request", async () => {
    await expect(change("owner", { profileId: ids.adminB, role: "USER", expectedRole: "ADMIN", requestId: randomUUID() })).resolves.toMatchObject({ status: "success", message: "平台角色已更新。" });
    await expect(redirectOf(change("adminB", { profileId: ids.userD, role: "ADMIN", expectedRole: "USER", requestId: randomUUID() }))).resolves.toBe("/workspace");
    await expect(redirectOf(loadDirectory("adminB"))).resolves.toBe("/workspace");
    expect(await roleOf("userD")).toBe("USER");
  });

  it("audits exactly the applied changes, all made by the OWNER", async () => {
    const audits = await db.platformRoleAudit.findMany();
    // userC grant + revoke, userF grant, userE grant, adminB revoke.
    expect(audits).toHaveLength(5);
    expect(audits.every((audit) => audit.actorId === ids.owner)).toBe(true);
    expect(new Set(audits.map((audit) => audit.requestId)).size).toBe(5);
    expect(audits.map((audit) => audit.targetId).sort()).toEqual([ids.userC, ids.userC, ids.userF, ids.userE, ids.adminB].sort());
  });
});
