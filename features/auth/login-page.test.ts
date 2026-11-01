import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), config: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/env/supabase", () => ({ getSupabasePublicConfig: mocks.config }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/actions", () => ({ signIn: vi.fn() }));
import LoginPage from "@/app/(auth)/login/page";

beforeEach(() => {
  vi.clearAllMocks(); mocks.config.mockReturnValue({ url: "https://auth.example.test" }); mocks.user.mockResolvedValue(null);
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});
describe("login session restoration", () => {
  it.each([["/chat/c1?personaId=p", "/chat/c1?personaId=p"], ["//evil.test", "/workspace"], [undefined, "/workspace"]])("restores a server-verified user at a safe target %s", async (next, expected) => {
    mocks.user.mockResolvedValue({ id: "synthetic" });
    await expect(LoginPage({ searchParams: Promise.resolve({ next }) })).rejects.toThrow(`redirect:${expected}`);
  });
  it("shows the login form for absent, expired or revoked sessions", async () => {
    expect(await LoginPage({ searchParams: Promise.resolve({}) })).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("still renders the configuration warning without attempting Auth when unconfigured", async () => {
    mocks.config.mockReturnValue(null);
    expect(await LoginPage({ searchParams: Promise.resolve({ configuration: "missing" }) })).toBeTruthy();
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
