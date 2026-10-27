import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/env/supabase", () => ({ getSupabasePublicConfig: mocks.config }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.config.mockReturnValue({ url: "https://auth.example.test", anonKey: "public" }); });
describe("session-aware public platform entry", () => {
  it.each([[null, "/login?next=%2Fworkspace"],[{ id: "synthetic" }, "/workspace"]])("routes according to the authenticated viewer", async (user, path) => {
    mocks.user.mockResolvedValue(user);
    const response = await GET(new NextRequest("https://app.example.test/enter"));
    expect(response.headers.get("location")).toBe(`https://app.example.test${path}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("offers login even when auth configuration is missing", async () => {
    mocks.config.mockReturnValue(null);
    const response = await GET(new NextRequest("https://app.example.test/enter"));
    expect(response.headers.get("location")).toContain("/login?next=%2Fworkspace");
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
