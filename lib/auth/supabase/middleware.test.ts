import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn(), config: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("@/lib/env/supabase", () => ({ getSupabasePublicConfig: mocks.config }));
import { updateSupabaseSession } from "./middleware";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ url: "https://auth.example.test", anonKey: "public-test-key" });
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.create.mockReturnValue({ auth: { getUser: mocks.getUser } });
});

describe("public brand and protected platform boundary", () => {
  it.each(["/", "/login", "/register", "/enter", "/marketing/chat.svg"])("never reads auth for public %s", async (path) => {
    expect((await updateSupabaseSession(new NextRequest(`https://example.test${path}`))).status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["/workspace", "/memories?scope=all", "/agents/run", "/chat/abc?personaId=p", "/tools/image", "/admin", "/personas"])("protects %s and preserves its complete target", async (path) => {
    const response = await updateSupabaseSession(new NextRequest(`https://example.test${path}`));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(path);
  });
  it("allows signed-in workspace access", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user" } } });
    expect((await updateSupabaseSession(new NextRequest("https://example.test/workspace"))).status).toBe(200);
  });
  it("keeps missing-config failures on the login flow with a return target", async () => {
    mocks.config.mockReturnValue(null);
    const response = await updateSupabaseSession(new NextRequest("https://example.test/workspace?view=recent"));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("configuration")).toBe("missing");
    expect(location.searchParams.get("next")).toBe("/workspace?view=recent");
  });
  it("forwards refreshed cookies on a login redirect", async () => {
    mocks.create.mockImplementationOnce((_url, _key, options) => {
      options.cookies.setAll([{ name: "refresh-test", value: "synthetic", options: { httpOnly: true, path: "/" } }]);
      return { auth: { getUser: mocks.getUser } };
    });
    const response = await updateSupabaseSession(new NextRequest("https://example.test/workspace"));
    expect(response.cookies.get("refresh-test")?.value).toBe("synthetic");
  });
});
