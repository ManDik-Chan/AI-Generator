import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ password: vi.fn(), signup: vi.fn(), signout: vi.fn(), ensure: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { signInWithPassword: mocks.password, signUp: mocks.signup, signOut: mocks.signout } }) }));
vi.mock("@/lib/auth/profile", () => ({ ensureProfile: mocks.ensure }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { signIn, signOut, signUp } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.password.mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: null });
  mocks.signup.mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: null });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});
function credentials(next?: string) { const data = new FormData(); data.set("email", "synthetic@example.test"); data.set("password", "synthetic-test-password"); if(next)data.set("next", next); return data; }

describe("auth return flow", () => {
  it.each([[undefined,"/workspace"],["/chat/c1?personaId=p","/chat/c1?personaId=p"],["//evil.test/chat","/workspace"]])("returns password login to a safe target %s", async (next, expected) => {
    await expect(signIn({}, credentials(next))).rejects.toThrow(`redirect:${expected}`);
    expect(mocks.ensure).toHaveBeenCalledWith({ id: "synthetic-user" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("never redirects on rejected credentials", async () => {
    mocks.password.mockResolvedValue({ data: { user: null }, error: new Error("bad credentials") });
    expect(await signIn({}, credentials())).toEqual({ error: "邮箱或密码不正确。" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("carries safe return targets through signup email and subsequent login", async () => {
    const data = credentials("/memories?scope=all");data.set("displayName", "演示用户");
    await expect(signUp({}, data)).rejects.toThrow("redirect:/login?registered=1&next=%2Fmemories%3Fscope%3Dall");
    expect(mocks.signup.mock.calls[0][0].options.emailRedirectTo).toContain("/auth/callback?next=%2Fmemories%3Fscope%3Dall");
  });
  it("signs out and returns to login", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/login");
    expect(mocks.signout).toHaveBeenCalledOnce();
  });
});
