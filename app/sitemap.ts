import type { MetadataRoute } from "next";

import { LANDING_LANGUAGES, LANDING_PATHS } from "@/features/landing/metadata";
import { indexablePaths } from "@/features/seo/index-policy";
import { absoluteUrl } from "@/lib/site";

const landingPaths = new Set<string>(Object.values(LANDING_PATHS));
const landingAlternates = Object.fromEntries(Object.entries(LANDING_LANGUAGES).map(([lang, path]) => [lang, absoluteUrl(path)]));

// No lastModified: these pages have no trustworthy per-page date, and a build time would misstate it.
export default function sitemap(): MetadataRoute.Sitemap {
  return indexablePaths().map((path) => ({
    url: absoluteUrl(path),
    ...(landingPaths.has(path) ? { alternates: { languages: landingAlternates } } : {}),
  }));
}
