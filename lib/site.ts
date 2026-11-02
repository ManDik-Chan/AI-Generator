/**
 * Canonical public origin of the site. Fixed on purpose rather than read from the
 * environment: Preview deployments, the *.vercel.app alias and local builds must still
 * point canonical links, sitemaps and share cards at the production domain.
 * ai-mdc.com redirects to this host (308).
 */
export const SITE_ORIGIN = "https://www.ai-mdc.com";
export const SITE_HOST = new URL(SITE_ORIGIN).host;
export const SITE_NAME = "AI-Generator";

/** Absolute URL on the canonical origin for a root-relative path ("/docs", "/?lang=en"). */
export function absoluteUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error(`Expected a root-relative path, got ${path}`);
  return new URL(path, SITE_ORIGIN).toString();
}
