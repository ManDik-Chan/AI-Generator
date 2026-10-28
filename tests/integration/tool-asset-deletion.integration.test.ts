import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";

// The database and Auth/JWT are real. Only Storage removal is a controlled fault
// injection boundary; these tests do not claim a live Storage service was tested.
const injected = vi.hoisted(() => ({
  currentUser: async (): Promise<{ id: string }> => { throw new Error("No test session"); },
  remove: vi.fn<(paths: string[]) => Promise<void>>(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => injected.currentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/tools/image/storage", async (original) => ({
  ...await original<object>(), removeToolAssets: (paths: string[]) => injected.remove(paths),
}));

import { deleteToolRunAction } from "@/features/tools/actions";

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = Boolean(integrationDatabaseEnabled && url && anon && serviceKey);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) {
  throw new Error("Deletion regression requires real isolated Auth, JWT and PostgreSQL; no silent skip in acceptance.");
}

describe.skipIf(!enabled)("real database ToolAsset deletion security regression", () => {
  let db: PrismaClient;
  let admin: SupabaseClient;
  let userA: SupabaseClient;
  let idA: string;
  let idB: string;

  beforeAll(async () => {
    db = createIntegrationPrisma();
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const password = `Isolated!${randomUUID()}`;
    const emailA = `delete-user-${randomUUID()}@example.test`;
    const emailB = `delete-admin-${randomUUID()}@example.test`;
    const a = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
    const b = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
    expect(a.error).toBeNull(); expect(b.error).toBeNull();
    idA = a.data.user!.id; idB = b.data.user!.id;
    await db.profile.update({ where: { id: idB }, data: { role: "ADMIN" } });
    userA = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await userA.auth.signInWithPassword({ email: emailA, password });
    expect(signed.error).toBeNull(); expect(signed.data.session?.access_token).toBeTruthy();
    injected.currentUser = async () => {
      const result = await userA.auth.getUser();
      if (result.error || !result.data.user) throw new Error("Real test JWT is invalid");
      return { id: result.data.user.id };
    };
  }, 120_000);

  beforeEach(() => { injected.remove.mockReset(); injected.remove.mockResolvedValue(undefined); });

  afterAll(async () => {
    if (admin) for (const id of [idA, idB].filter(Boolean)) {
      const result = await admin.auth.admin.deleteUser(id);
      expect(result.error).toBeNull();
    }
    await db?.$disconnect();
  }, 120_000);

  async function fixture(owner: string, pathOwner = owner) {
    const run = await db.toolRun.create({ data: { userId: owner, type: "IMAGE_ANALYZE", status: "COMPLETE", options: {}, retainContent: true } });
    const storagePath = `${pathOwner}/${run.id}/${randomUUID()}.png`;
    const asset = await db.toolAsset.create({ data: {
      userId: owner, toolRunId: run.id, storagePath, mimeType: "image/png", sizeBytes: 32,
      width: 1, height: 1, sha256: "a".repeat(64), expiresAt: new Date(Date.now() + 86_400_000),
    } });
    return { run, asset, storagePath };
  }

  it("rejects another owner's run ID without calling privileged Storage removal", async () => {
    const b = await fixture(idB);
    expect(await deleteToolRunAction(b.run.id)).toMatchObject({ success: false });
    expect(injected.remove).not.toHaveBeenCalled();
    expect(await db.toolRun.count({ where: { id: b.run.id, userId: idB } })).toBe(1);
    expect(await db.toolAsset.count({ where: { id: b.asset.id, userId: idB } })).toBe(1);
  });

  it("deletes an owned completed run after successful Storage removal", async () => {
    const a = await fixture(idA);
    expect(await deleteToolRunAction(a.run.id)).toMatchObject({ success: true });
    expect(injected.remove).toHaveBeenCalledWith([a.storagePath]);
    expect(await db.toolRun.count({ where: { id: a.run.id } })).toBe(0);
    expect(await db.toolAsset.count({ where: { id: a.asset.id } })).toBe(0);
  });

  it("must retain a durable cleanup basis and refuse success when Storage deletion fails", async () => {
    const a = await fixture(idA);
    injected.remove.mockRejectedValue(new Error("INJECTED_STORAGE_DELETE_FAILURE"));
    const result = await deleteToolRunAction(a.run.id);
    expect.soft(result.success).toBe(false);
    expect.soft(await db.toolRun.count({ where: { id: a.run.id } })).toBe(1);
    expect.soft(await db.toolAsset.count({ where: { id: a.asset.id, storagePath: a.storagePath } })).toBe(1);
  });

  it("must reject a corrupted foreign-owner storage path before invoking privileged removal", async () => {
    // Deliberate trusted-writer corruption: ordinary JWT writes are separately denied.
    // This is not evidence that a client can write this corrupt row.
    const a = await fixture(idA, idB);
    const result = await deleteToolRunAction(a.run.id);
    expect.soft(result.success).toBe(false);
    expect.soft(injected.remove).not.toHaveBeenCalled();
    expect.soft(await db.toolAsset.count({ where: { id: a.asset.id } })).toBe(1);
  });
});
