/*
 * What search engines are pointed at (sitemap) and what they are asked to skip (robots).
 *
 * The sitemap lists only pages that are public, static and carry no noindex. Dynamic
 * pages come from the same data functions that build them, with their visibility rule:
 * Explore lists PUBLIC projects only (UNLISTED pages are noindex, PRIVATE ones 404), and
 * release previews are noindex. The /platform demo workspace (sample data), login and
 * register stay crawlable but are not promoted.
 *
 * robots.txt is advice to well-behaved crawlers, never access control: every disallowed
 * route below is still protected by middleware and server-side authorization.
 */
import { demos } from "@/features/demos/catalog";
import { LANDING_PATHS } from "@/features/landing/metadata";
import { listPublicProjects } from "@/features/platform/source";
import { experimentParams, researchProjectSlugs } from "@/features/research/source";
import { platformPrefixes } from "@/lib/auth/return-path";

/** Public pages with fixed paths: static, no session, no noindex. */
export const STATIC_PUBLIC_PATHS = [
  LANDING_PATHS.zh,
  LANDING_PATHS.en,
  "/explore",
  "/research",
  "/demos",
  "/docs",
  "/docs/guide",
  "/docs/api",
  "/docs/manifest",
  "/docs/status",
] as const;

/** Every path the sitemap lists, in a stable order. */
export function indexablePaths(): string[] {
  return [
    ...STATIC_PUBLIC_PATHS,
    ...demos.map((demo) => demo.href),
    ...listPublicProjects().data.map((project) => `/explore/${project.slug}`),
    ...researchProjectSlugs().map((slug) => `/research/${slug}`),
    ...experimentParams().map(({ slug, experiment }) => `/research/${slug}/${experiment}`),
  ];
}

/** API, auth plumbing and signed-in route families (redirects to /login for crawlers). */
export const ROBOTS_DISALLOW = ["/api/", "/auth/", "/enter", ...platformPrefixes] as const;

/** robots.txt prefix semantics, used to keep the sitemap and robots.txt consistent. */
export function isDisallowed(path: string): boolean {
  const pathname = new URL(path, "https://robots.invalid").pathname;
  return ROBOTS_DISALLOW.some((rule) => pathname.startsWith(rule));
}
