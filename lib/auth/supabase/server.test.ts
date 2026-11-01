import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieOptions } from "@supabase/ssr";
const mocks = vi.hoisted(() => ({ create: vi.fn(), getAll: vi.fn(), set: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.getAll, set: mocks.set }) }));
vi.mock("@/lib/env/supabase", () => ({ requireSupabasePublicConfig: () => ({ url: "https://example.supabase.co", anonKey: "synthetic" }) }));
import { clearSupabaseSession, createSupabaseServerClient } from "./server";

beforeEach(() => { vi.clearAllMocks(); mocks.getAll.mockReturnValue([]); });
function adapter() { return mocks.create.mock.calls[0][2].cookies; }
const token = (value = "synthetic", options: CookieOptions = { path: "/", maxAge: 34560000 }) => ({ name: "sb-example-auth-token", value, options });
describe("SSR cookie policy", () => {
  it.each(["session", "persistent"] as const)("writes the real %s choice alongside SDK session", async (mode) => {
    await createSupabaseServerClient(mode);
    adapter().setAll([token()]);
    expect(mocks.set.mock.calls[0][2].maxAge).toBe(mode === "session" ? undefined : 34560000);
    expect(mocks.set.mock.calls[1].slice(0, 2)).toEqual(["aig-auth-persistence", mode]);
  });
  it("does not upgrade a shared-device session during subsequent refresh", async () => {
    mocks.getAll.mockReturnValue([{ name: "aig-auth-persistence", value: "session" }]);
    await createSupabaseServerClient(); adapter().setAll([token()]);
    expect(mocks.set.mock.calls[0][2]).not.toHaveProperty("maxAge");
  });
  it("blocks stale refresh after logout but allows an explicit new login", async () => {
    mocks.getAll.mockReturnValue([{ name: "aig-auth-persistence", value: "signed-out" }, { name: "sb-example-auth-token", value: "stale" }, { name: "sb-example-auth-token-code-verifier", value: "new-verifier" }]);
    await createSupabaseServerClient();
    expect(adapter().getAll()).toEqual([]);
    adapter().setAll([token()]); expect(mocks.set).not.toHaveBeenCalled();
    mocks.create.mockClear(); await createSupabaseServerClient("session");
    expect(adapter().getAll()).toEqual(mocks.getAll());
    adapter().setAll([token()]); expect(mocks.set).toHaveBeenCalled();
  });
  it("clears all SDK chunks and verifier while preserving unrelated cookies", async () => {
    mocks.getAll.mockReturnValue(["sb-example-auth-token.0", "sb-example-auth-token.1", "sb-example-auth-token-code-verifier", "theme"].map(name => ({ name, value: "synthetic" })));
    await clearSupabaseSession();
    expect(mocks.set.mock.calls.slice(0, 3).map(([name]) => name)).toEqual(["sb-example-auth-token.0", "sb-example-auth-token.1", "sb-example-auth-token-code-verifier"]);
    expect(mocks.set.mock.calls.slice(0, 3).every(([, value, options]) => value === "" && options.maxAge === 0)).toBe(true);
    expect(mocks.set.mock.calls[3].slice(0, 2)).toEqual(["aig-auth-persistence", "signed-out"]);
  });
});
