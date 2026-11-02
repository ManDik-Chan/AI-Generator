import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/env/supabase", () => ({ getSupabasePublicConfig: mocks.config }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/auth/actions", () => ({ signIn: vi.fn(), signUp: vi.fn() }));
// Client-only chrome around the form; the heading structure does not depend on it.
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/platform/art", () => ({ ArtSurface: () => null }));

import AuthLayout from "./layout";
import LoginPage from "./login/page";
import RegisterPage from "./register/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ url: "https://auth.example.test" });
  mocks.user.mockResolvedValue(null);
});

const renderWithLayout = (page: ReactNode) => renderToStaticMarkup(createElement(AuthLayout, null, page));
const headings = (html: string) => [...html.matchAll(/<h1\b([^>]*)>(.*?)<\/h1>/g)].map((m) => ({ attrs: m[1], text: m[2] }));

describe("auth page headings", () => {
  it("gives the login page a single h1: the form title, not the brand tagline", async () => {
    const html = renderWithLayout(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(headings(html)).toHaveLength(1);
    expect(headings(html)[0].text).toBe("登录你的 AI 空间");
    // The tagline keeps its typography but is no longer a heading.
    expect(html).toMatch(/<p class="[^"]*text-lime[^"]*">.*展你所作，.*守你所藏。.*<\/p>/);
  });

  it("gives the register page a single h1 as well", async () => {
    const html = renderWithLayout(await RegisterPage({ searchParams: Promise.resolve({}) }));
    expect(headings(html).map((h) => h.text)).toEqual(["开始你的私人 AI 空间"]);
  });

  it.each([
    ["login", async () => LoginPage({ searchParams: Promise.resolve({}) })],
    ["register", async () => RegisterPage({ searchParams: Promise.resolve({}) })],
  ])("keeps the %s title's phrases together so no single glyph wraps alone", async (_, page) => {
    const [title] = headings(renderToStaticMarkup(await page()));
    // keep-all limits breaks to the spaces around "AI"; balance evens the lines; break-words is the overflow fallback.
    for (const utility of ["text-balance", "break-keep", "break-words"]) expect(title.attrs).toContain(utility);
  });
});
