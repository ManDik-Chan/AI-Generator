import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { combineChunks, createChunks, type CookieOptions } from "@supabase/ssr";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

import { createIntegrationPrisma, integrationDatabaseEnabled } from "./database";
import { AUTH_PERSISTENCE_COOKIE, authCookieName, isSessionCookie } from "@/lib/auth/supabase/persistence";
import { clearSupabaseSession, createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { getValidatedUser } from "@/lib/auth/supabase/validated-user";

type StoredCookie = { name: string; value: string; options: CookieOptions };

// Only the Next request boundary is simulated. Supabase SDK, Auth and PostgreSQL
// are real; every request gets a fresh production server adapter.
const request = vi.hoisted(() => ({ cookies: undefined as unknown }));
vi.mock("next/headers", () => ({ cookies: async () => request.cookies }));

class CookieJar {
  entries = new Map<string, StoredCookie>();
  getAll() { return [...this.entries.values()].map(({ name, value }) => ({ name, value })); }
  set(name: string, value: string, options: CookieOptions = {}) {
    if (options.maxAge !== undefined && options.maxAge <= 0) this.entries.delete(name);
    else this.entries.set(name, { name, value, options });
  }
  clone(persistentOnly = false) {
    const next = new CookieJar();
    for (const { name, value, options } of this.entries.values()) {
      // Model a fresh browser session without restoring session cookies. Actual
      // browser restore/password-manager behavior remains a separate browser gate.
      if (!persistentOnly || options.maxAge !== undefined || options.expires !== undefined) {
        next.set(name, value, { ...options });
      }
    }
    return next;
  }
}

const enabled = integrationDatabaseEnabled && Boolean(process.env.SUPABASE_TEST_URL
  && process.env.SUPABASE_TEST_ANON_KEY && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
if (process.env.REQUIRE_SECURITY_TEST_DATABASE === "true" && !enabled) throw new Error("Real Auth session acceptance requires the isolated database and local Auth keys");
if (enabled && ![process.env.TEST_DATABASE_URL!, process.env.SUPABASE_TEST_URL!]
  .every(value => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname))) {
  throw new Error("Auth session acceptance refuses non-loopback endpoints");
}

describe.skipIf(!enabled)("real Supabase login persistence, refresh and session security", () => {
  let db: PrismaClient, service: SupabaseClient, userId: string;
  const email = `auth-session-${randomUUID()}@example.test`, password = `Aa!${randomUUID()}z9`;
  const url = process.env.SUPABASE_TEST_URL!;
  const key = authCookieName(url ?? "http://127.0.0.1");

  async function client(jar: CookieJar, mode?: "session" | "persistent") {
    request.cookies = jar;
    return createSupabaseServerClient(mode);
  }
  async function login(mode: "session" | "persistent" = "persistent", jar = new CookieJar()) {
    const supabase = await client(jar, mode);
    const result = await supabase.auth.signInWithPassword({ email, password });
    expect(Boolean(result.error), "Synthetic login must succeed without exposing credentials").toBe(false);
    expect(result.data.user?.id).toBe(userId);
    expect(Boolean(result.data.session)).toBe(true);
    return { jar, supabase, session: result.data.session! };
  }
  const authCookies = (jar: CookieJar) => [...jar.entries.values()].filter(cookie => isSessionCookie(cookie.name, url));
  const sessionId = (session: Session) => JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8")).session_id as string;

  async function expireStoredMetadata(jar: CookieJar) {
    const encoded = await combineChunks(key, name => jar.entries.get(name)?.value);
    expect(Boolean(encoded?.startsWith("base64-"))).toBe(true);
    const stored = JSON.parse(Buffer.from(encoded!.slice("base64-".length), "base64url").toString("utf8"));
    stored.expires_at = Math.floor(Date.now() / 1000) - 60;
    const options = authCookies(jar)[0].options;
    for (const cookie of authCookies(jar)) jar.entries.delete(cookie.name);
    for (const chunk of createChunks(key, `base64-${Buffer.from(JSON.stringify(stored)).toString("base64url")}`)) {
      jar.set(chunk.name, chunk.value, { ...options });
    }
  }

  beforeAll(async () => {
    db = createIntegrationPrisma();
    service = createClient(url, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.SUPABASE_TEST_ANON_KEY!);
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(Boolean(created.error)).toBe(false);
    userId = created.data.user!.id;
  }, 60_000);

  afterAll(async () => {
    try {
      if (userId) {
        expect(Boolean((await service.auth.admin.deleteUser(userId)).error)).toBe(false);
        await db.profile.deleteMany({ where: { id: userId } });
      }
    } finally {
      await db?.$disconnect();
      vi.unstubAllEnvs();
    }
  }, 60_000);

  it("restores a remembered login on fresh server requests and a modeled browser restart", async () => {
    const { jar } = await login();
    expect(jar.entries.get(AUTH_PERSISTENCE_COOKIE)?.value).toBe("persistent");
    expect(authCookies(jar).length).toBeGreaterThan(0);
    expect(authCookies(jar).every(cookie => Number(cookie.options.maxAge) > 0)).toBe(true);
    for (let i = 0; i < 3; i++) expect((await getValidatedUser(await client(jar)))?.id).toBe(userId);
    expect((await getValidatedUser(await client(jar.clone(true))))?.id).toBe(userId);
  });

  it("keeps unchecked login in session cookies through real SDK token refresh", async () => {
    const { jar, session } = await login("session");
    expect(jar.entries.get(AUTH_PERSISTENCE_COOKIE)?.value).toBe("session");
    expect(authCookies(jar).every(cookie => cookie.options.maxAge === undefined && cookie.options.expires === undefined)).toBe(true);
    expect((await getValidatedUser(await client(jar)))?.id).toBe(userId);
    // Force the SDK's expiry path without extending or forging any server token.
    await expireStoredMetadata(jar);
    const refreshed = await client(jar);
    expect((await getValidatedUser(refreshed))?.id).toBe(userId);
    const next = await refreshed.auth.getSession();
    expect(Boolean(next.error)).toBe(false);
    expect(next.data.session?.refresh_token !== session.refresh_token).toBe(true);
    expect(authCookies(jar).every(cookie => cookie.options.maxAge === undefined && cookie.options.expires === undefined)).toBe(true);
    expect(await getValidatedUser(await client(jar.clone(true)))).toBeNull();
  });

  it("retains remembered persistence when expired stored metadata triggers refresh", async () => {
    const { jar, session } = await login();
    await expireStoredMetadata(jar);
    const refreshed = await client(jar);
    expect((await getValidatedUser(refreshed))?.id).toBe(userId);
    expect((await refreshed.auth.getSession()).data.session?.refresh_token !== session.refresh_token).toBe(true);
    expect(authCookies(jar).every(cookie => Number(cookie.options.maxAge) > 0)).toBe(true);
    expect((await getValidatedUser(await client(jar.clone(true))))?.id).toBe(userId);
  });

  it("rejects invalid credentials without creating a remembered session", async () => {
    const jar = new CookieJar(), supabase = await client(jar, "persistent");
    const result = await supabase.auth.signInWithPassword({ email, password: `Wrong!${randomUUID()}` });
    expect(Boolean(result.error)).toBe(true);
    expect(Boolean(result.data.session)).toBe(false);
    expect(authCookies(jar).length).toBe(0);
    expect(jar.entries.has(AUTH_PERSISTENCE_COOKIE)).toBe(false);
    expect(await getValidatedUser(await client(jar))).toBeNull();
  });

  it("rejects revoked sessions immediately and refuses their real refresh tokens", async () => {
    const { jar, session } = await login();
    const stale = jar.clone();
    expect((await getValidatedUser(await client(jar)))?.id).toBe(userId);
    expect(Boolean((await service.auth.admin.signOut(session.access_token, "global")).error)).toBe(false);
    expect(await getValidatedUser(await client(jar))).toBeNull();
    await expireStoredMetadata(stale);
    const refreshed = await client(stale), result = await refreshed.auth.getSession();
    expect(Boolean(result.data.session)).toBe(false);
    expect(await getValidatedUser(refreshed)).toBeNull();
  });

  it("rejects server-side session expiry while its signed access token is still current", async () => {
    const { jar, session } = await login();
    const id = sessionId(session);
    expect(await db.$executeRaw`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${id}::uuid AND user_id=${userId}::uuid`).toBe(1);
    expect(await getValidatedUser(await client(jar))).toBeNull();
    await expireStoredMetadata(jar);
    expect(Boolean((await (await client(jar)).auth.getSession()).data.session)).toBe(false);
  });

  it("clears logout cookies and prevents a stale refresh response from restoring login", async () => {
    const { jar, session } = await login();
    const stale = jar.clone();
    const signingOut = await client(jar);
    expect(Boolean((await signingOut.auth.signOut()).error)).toBe(false);
    request.cookies = jar;
    await clearSupabaseSession();
    expect(authCookies(jar).length).toBe(0);
    expect(jar.entries.get(AUTH_PERSISTENCE_COOKIE)?.value).toBe("signed-out");
    expect(await getValidatedUser(await client(jar))).toBeNull();
    // An older response can still arrive with token chunks. The separate logout
    // marker must keep them unreadable, including on a new server request.
    for (const cookie of authCookies(stale)) jar.set(cookie.name, cookie.value, cookie.options);
    jar.set(`${key}.9`, "obsolete-tail", { path: "/", maxAge: 86400 });
    expect(await getValidatedUser(await client(jar))).toBeNull();
    const failedLogin = await (await client(jar, "persistent")).auth.signInWithPassword({
      email, password: `Wrong!${randomUUID()}`,
    });
    expect(Boolean(failedLogin.error)).toBe(true);
    expect(Boolean(failedLogin.data.session)).toBe(false);
    expect(jar.entries.get(AUTH_PERSISTENCE_COOKIE)?.value).toBe("signed-out");
    expect(await getValidatedUser(await client(jar))).toBeNull();
    const { error } = await service.auth.getUser(session.access_token);
    expect(Boolean(error), "Auth must reject the logged-out session").toBe(true);
    await login("session", jar);
    expect(jar.entries.has(`${key}.9`)).toBe(false);
    expect(jar.entries.get(AUTH_PERSISTENCE_COOKIE)?.value).toBe("session");
    expect((await getValidatedUser(await client(jar)))?.id).toBe(userId);
  });

  it("rejects tampered cookie credentials and a forged persistence preference", async () => {
    const { jar } = await login();
    for (const cookie of authCookies(jar)) jar.set(cookie.name, "base64-e30", cookie.options);
    jar.set(AUTH_PERSISTENCE_COOKIE, "persistent", { maxAge: 86400 });
    expect(await getValidatedUser(await client(jar))).toBeNull();
  });

  it("handles concurrent navigation and rejects stale tabs after session revocation", async () => {
    const { jar, session } = await login();
    const clients = await Promise.all([client(jar.clone()), client(jar.clone()), client(jar.clone())]);
    expect((await Promise.all(clients.map(getValidatedUser))).every(user => user?.id === userId)).toBe(true);
    expect(Boolean((await service.auth.admin.signOut(session.access_token, "global")).error)).toBe(false);
    expect((await Promise.all(clients.map(getValidatedUser))).every(user => user === null)).toBe(true);
  });
});
