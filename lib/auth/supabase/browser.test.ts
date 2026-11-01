import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieOptions } from "@supabase/ssr";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@supabase/ssr", async (importOriginal) => ({
  ...await importOriginal<typeof import("@supabase/ssr")>(), createBrowserClient: mocks.create,
}));
vi.mock("@/lib/env/supabase", () => ({ requireSupabasePublicConfig: () => ({ url: "https://example.supabase.co", anonKey: "synthetic" }) }));
import { createSupabaseBrowserClient } from "./browser";

let cookieHeader: string;
let writes: string[];
beforeEach(() => {
  vi.resetAllMocks();
  cookieHeader = "aig-auth-persistence=session; sb-example-auth-token.0=synthetic";
  writes = [];
  const documentState = {};
  Object.defineProperty(documentState, "cookie", { get: () => cookieHeader, set: (value: string) => writes.push(value) });
  vi.stubGlobal("document", documentState);
});
afterEach(() => vi.unstubAllGlobals());
function adapter() {
  createSupabaseBrowserClient();
  return mocks.create.mock.calls[0][2].cookies;
}
const refreshedCookie = (options: CookieOptions = { path: "/", maxAge: 34560000, sameSite: "lax", secure: true }) => ({
  name: "sb-example-auth-token.0", value: "synthetic-refreshed", options,
});

describe("browser SDK cookie persistence adapter", () => {
  it("shares real SDK cookie chunks with the server and removes persistent lifetime in session mode", () => {
    const cookies = adapter();
    expect(cookies.getAll()).toContainEqual({ name: "sb-example-auth-token.0", value: "synthetic" });
    cookies.setAll([refreshedCookie()]);
    expect(writes[0]).toContain("sb-example-auth-token.0=synthetic-refreshed");
    expect(writes[0]).toContain("Path=/");
    expect(writes[0]).toContain("SameSite=Lax");
    expect(writes[0]).toContain("Secure");
    expect(writes[0]).not.toMatch(/Max-Age|Expires/);
  });

  it("re-reads the current preference on a cached client's next refresh", () => {
    const cookies = adapter();
    cookieHeader = "aig-auth-persistence=persistent";
    cookies.setAll([refreshedCookie()]);
    expect(writes[0]).toContain("Max-Age=34560000");
    cookieHeader = "aig-auth-persistence=session";
    cookies.setAll([refreshedCookie()]);
    expect(writes[1]).not.toMatch(/Max-Age|Expires/);
  });

  it("keeps deletion instructions while blocking late refresh writes after logout", () => {
    const cookies = adapter();
    cookieHeader = "aig-auth-persistence=signed-out; sb-example-auth-token.0=late";
    expect(cookies.getAll()).toEqual([]);
    cookies.setAll([
      refreshedCookie(),
      { name: "sb-example-auth-token.1", value: "", options: { path: "/", maxAge: 0 } },
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("sb-example-auth-token.1=;");
    expect(writes[0]).toContain("Max-Age=0");
  });
});
