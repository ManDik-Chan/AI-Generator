import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) }));
import { GET } from "./route";
beforeEach(() => { exchange.mockReset(); exchange.mockResolvedValue({ error: null }); });
describe("auth callback return boundary", () => {
  it.each([["/chat/c1?view=all", "/chat/c1?view=all"],["//evil.test", "/workspace"],["/\\evil.test", "/workspace"],["/", "/workspace"]])("validates callback target %s", async (next,expected) => {
    const response = await GET(new NextRequest(`https://app.example.test/auth/callback?code=synthetic&next=${encodeURIComponent(next)}`));
    expect(response.headers.get("location")).toBe(`https://app.example.test${expected}`);
    expect(exchange).toHaveBeenCalledWith("synthetic");
  });
  it("preserves a safe deep link when code exchange fails", async () => {
    exchange.mockResolvedValue({ error: new Error("expired") });
    const response = await GET(new NextRequest("https://app.example.test/auth/callback?code=expired&next=%2Ftools%2Fimage"));
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("next")).toBe("/tools/image");
    expect(target.searchParams.get("error")).toBe("callback");
  });
});
