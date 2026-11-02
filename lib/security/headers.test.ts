import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { themeInitializationScript } from "../theme";
import { buildSecurityHeaders } from "./headers";

const policy = (url?: string) => buildSecurityHeaders(url).find(({ key }) => key === "Content-Security-Policy-Report-Only")!.value;

describe("browser response security policy", () => {
  it("enforces the audited baseline separately from the reporting policy", () => {
    const headers = Object.fromEntries(buildSecurityHeaders().map(({ key, value }) => [key, value]));
    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    expect(headers["Permissions-Policy"]).toContain("clipboard-write=(self)");
    expect(headers["Permissions-Policy"]).toContain("fullscreen=(self)");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    for (const name of ["Content-Security-Policy", "Strict-Transport-Security", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy"]) expect(headers).not.toHaveProperty(name);
  });

  it("uses a strict Report-Only candidate and a hash of the actual theme bootstrap", () => {
    const csp = policy();
    expect(csp).toContain(`'sha256-${createHash("sha256").update(themeInitializationScript).digest("base64")}'`);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src-attr 'none'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("report-uri /api/security/csp-report");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it("allows only the configured Supabase origin for SDK requests and signed image redirects", () => {
    const csp = policy("https://project.supabase.co/storage/path?secret=hidden#fragment");
    expect(csp).toContain("connect-src 'self' https://project.supabase.co;");
    expect(csp).toContain("img-src 'self' blob: https://project.supabase.co;");
    expect(csp).not.toMatch(/secret|storage\/path|fragment|supabase\.com/);
  });

  it.each(["not a url", "javascript:alert(1)", "https://*.supabase.co", "https://user:password@project.supabase.co", "https://evil;img-src.example", "https://x'foo.example"])("rejects unsafe source configuration: %s", (url) => {
    expect(policy(url)).toBe(policy());
  });

  it("supports exact disposable loopback origins without adding a global development allowance", () => {
    expect(policy("http://127.0.0.1:60921")).toContain("connect-src 'self' http://127.0.0.1:60921;");
    expect(policy()).not.toContain("http:");
  });

  it("applies before files/routes for normal, error, API, RSC and static responses", async () => {
    const routes = await nextConfig.headers!();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.source).toBe("/:path*");
    expect(routes[0]?.headers).toEqual(buildSecurityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL));
  });
});
