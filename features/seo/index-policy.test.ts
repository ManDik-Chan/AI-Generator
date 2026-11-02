import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getPublicProject, publicProjectSlugs } from "@/features/platform/source";
import { indexablePaths, isDisallowed, ROBOTS_DISALLOW, STATIC_PUBLIC_PATHS } from "@/features/seo/index-policy";
import { isPlatformPath, platformPrefixes } from "@/lib/auth/return-path";
import { SITE_ORIGIN } from "@/lib/site";

const ROOT = join(__dirname, "../..");
const pathnames = () => indexablePaths().map((path) => new URL(path, SITE_ORIGIN).pathname);

describe("sitemap", () => {
  it("lists absolute, unique URLs on the canonical origin only", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.length).toBeGreaterThan(10);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe(SITE_ORIGIN);
      expect(parsed.hash).toBe("");
      expect(parsed.search === "" || parsed.search === "?lang=en").toBe(true);
    }
  });

  it("covers the public showcase families and both landing languages", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of ["/", "/?lang=en", "/explore", "/explore/ai-generator", "/research", "/research/route-optimizer", "/demos", "/demos/route-optimizer", "/demos/neural-network", "/docs", "/docs/api"]) {
      expect(urls).toContain(new URL(path, SITE_ORIGIN).toString());
    }
    const home = sitemap().filter((entry) => ["/", "/?lang=en"].includes(new URL(entry.url).pathname + new URL(entry.url).search));
    expect(home).toHaveLength(2);
    for (const entry of home) {
      expect(entry.alternates?.languages).toEqual({ "zh-CN": `${SITE_ORIGIN}/`, en: `${SITE_ORIGIN}/?lang=en`, "x-default": `${SITE_ORIGIN}/` });
    }
  });

  it("never lists signed-in, API, auth, demo-workspace or login pages", () => {
    for (const pathname of pathnames()) {
      expect(isPlatformPath(pathname), pathname).toBe(false);
      expect(pathname).not.toMatch(/^\/(?:api|auth|enter|platform|login|register)(?:\/|$)/);
    }
  });

  it("lists only PUBLIC Explore projects, never UNLISTED or PRIVATE ones", () => {
    const listed = pathnames().filter((path) => path.startsWith("/explore/")).map((path) => path.slice("/explore/".length));
    expect(listed.length).toBeGreaterThan(0);
    for (const slug of listed) expect(getPublicProject(slug).data?.visibility).toBe("PUBLIC");
    const hidden = publicProjectSlugs().filter((slug) => getPublicProject(slug).data?.visibility !== "PUBLIC");
    expect(hidden.length).toBeGreaterThan(0);
    for (const slug of hidden) expect(listed).not.toContain(slug);
    expect(pathnames().some((path) => path.endsWith("/release"))).toBe(false);
  });

  it("keeps every fixed path backed by a page file", () => {
    for (const path of STATIC_PUBLIC_PATHS) {
      const pathname = new URL(path, SITE_ORIGIN).pathname;
      const page = pathname === "/" ? "app/(marketing)/page.tsx" : `app${pathname}/page.tsx`;
      expect(existsSync(join(ROOT, page)), page).toBe(true);
    }
  });
});

describe("robots.txt", () => {
  it("allows the site, points at the sitemap and asks crawlers to skip private families", () => {
    const result = robots();
    expect(result.sitemap).toBe(`${SITE_ORIGIN}/sitemap.xml`);
    expect(result.rules).toEqual([{ userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] }]);
    for (const rule of ["/api/", "/auth/", "/enter", ...platformPrefixes]) expect(ROBOTS_DISALLOW).toContain(rule);
  });

  it("never blocks crawling of public pages, assets, noindex previews or share images", () => {
    for (const path of indexablePaths()) expect(isDisallowed(path), path).toBe(false);
    for (const path of ["/_next/static/chunks/main.js", "/og/ai-generator-zh.jpg", "/explore/air-quality", "/explore/ai-generator/release", "/platform", "/login", "/.well-known/security.txt"]) {
      expect(isDisallowed(path), path).toBe(false);
    }
  });
});
