import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "@/tests/integration/database";

const url = process.env.SUPABASE_TEST_URL?.trim();
const anonKey = process.env.SUPABASE_TEST_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY?.trim();
const enabled = Boolean(integrationDatabaseEnabled && url && anonKey && serviceKey);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) {
  throw new Error("Platform RBAC acceptance requires isolated PostgreSQL and Supabase Auth; no security test may be skipped.");
}
if (enabled && ![process.env.TEST_DATABASE_URL!, url!].every((value) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname))) {
  throw new Error("Platform RBAC integration tests require loopback-only endpoints.");
}

describe.skipIf(!enabled)("platform RBAC real database protections", () => {
  let db: PrismaClient;
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let user: SupabaseClient;
  let userId = "";
  let secondId = "";
  const password = `Z!${randomUUID()}a9`;
  const email = `rbac-${randomUUID()}@example.test`;
  const secondEmail = `rbac-${randomUUID()}@example.test`;
  const makeClient = () => createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });

  beforeAll(async () => {
    db = createIntegrationPrisma();
    service = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    anon = makeClient();
    user = makeClient();
    const first = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(first.error).toBeNull();
    userId = first.data.user!.id;
    const second = await service.auth.admin.createUser({ email: secondEmail, password, email_confirm: true });
    expect(second.error).toBeNull();
    secondId = second.data.user!.id;
    expect((await user.auth.signInWithPassword({ email, password })).error).toBeNull();
  }, 120_000);

  afterAll(async () => {
    if (!service || !db) return;
    for (const id of [userId, secondId].filter(Boolean)) {
      expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
    }
    await db.profile.deleteMany({ where: { id: { in: [userId, secondId].filter(Boolean) } } });
    await db.$disconnect();
  }, 120_000);

  it("retains ADMIN and rejects OWNER removal, duplicates, auth deletion and lockout inside a rolled-back transaction", async () => {
    const rollback = new Error("fixture rollback");
    await expect(db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`UPDATE public.profiles SET role = 'ADMIN' WHERE id = ${secondId}::uuid`);
      await tx.$executeRaw(Prisma.sql`UPDATE public.profiles SET role = 'OWNER' WHERE id = ${userId}::uuid`);
      expect((await tx.$queryRaw<{ role: string }[]>(Prisma.sql`SELECT role::text FROM public.profiles WHERE id = ${secondId}::uuid`))[0].role).toBe("ADMIN");
      const rejected = async (sql: Prisma.Sql) => {
        await tx.$executeRawUnsafe("SAVEPOINT attack");
        await expect(tx.$executeRaw(sql)).rejects.toThrow();
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attack");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT attack");
      };
      await rejected(Prisma.sql`UPDATE public.profiles SET role = 'USER' WHERE id = ${userId}::uuid`);
      await rejected(Prisma.sql`DELETE FROM public.profiles WHERE id = ${userId}::uuid`);
      await rejected(Prisma.sql`UPDATE public.profiles SET role = 'OWNER' WHERE id = ${secondId}::uuid`);
      await rejected(Prisma.sql`DELETE FROM auth.users WHERE id = ${userId}::uuid`);
      await rejected(Prisma.sql`UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = ${userId}::uuid`);
      await rejected(Prisma.sql`UPDATE auth.users SET deleted_at = now() WHERE id = ${userId}::uuid`);
      expect((await tx.$queryRaw<{ role: string }[]>(Prisma.sql`SELECT role::text FROM public.profiles WHERE id = ${userId}::uuid`))[0].role).toBe("OWNER");
      throw rollback;
    }, { timeout: 30_000 })).rejects.toBe(rollback);
    expect((await db.profile.findUniqueOrThrow({ where: { id: userId } })).role).toBe("USER");
  });

  it("denies anonymous and authenticated audit access and forged profile roles", async () => {
    for (const client of [anon, user]) {
      expect((await client.from("platform_role_audits").select("*")).error).not.toBeNull();
      expect((await client.from("platform_role_audits").insert({
        id: randomUUID(), actor_id: userId, target_id: secondId,
        old_role: "USER", new_role: "ADMIN", request_id: randomUUID(),
      })).error).not.toBeNull();
      expect((await client.from("platform_role_audits").update({ new_role: "OWNER" }).eq("target_id", secondId)).error).not.toBeNull();
      expect((await client.from("platform_role_audits").delete().eq("target_id", secondId)).error).not.toBeNull();
    }
    for (const role of ["ADMIN", "OWNER"]) {
      expect((await user.from("profiles").update({ role }).eq("id", userId)).error).not.toBeNull();
    }
    expect((await db.profile.findUniqueOrThrow({ where: { id: userId } })).role).toBe("USER");
  });
});
