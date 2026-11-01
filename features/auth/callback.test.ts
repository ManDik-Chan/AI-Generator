import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ create: vi.fn(), exchange: vi.fn() }));
vi.mock("@/lib/auth/supabase/server", () => ({ createSupabaseServerClient: mocks.create }));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => {
  vi.resetAllMocks(); mocks.create.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange } }); mocks.exchange.mockResolvedValue({ error: null });
});
describe("PKCE registration callback", () => {
  it("completes a new registration after logout with a session-only policy", async () => {
    const response = await GET(new NextRequest("https://example.test/auth/callback?code=synthetic&next=/memories"));
    expect(mocks.create).toHaveBeenCalledWith("session");
    expect(mocks.exchange).toHaveBeenCalledWith("synthetic");
    expect(response.headers.get("location")).toBe("https://example.test/memories");
  });
  it("keeps invalid callback errors and safe return paths free of credentials", async () => {
    mocks.exchange.mockResolvedValue({ error: new Error("synthetic failure") });
    const response = await GET(new NextRequest("https://example.test/auth/callback?code=synthetic&next=//evil.test"));
    expect(response.headers.get("location")).toBe("https://example.test/login?error=callback&next=%2Fworkspace");
  });
});
