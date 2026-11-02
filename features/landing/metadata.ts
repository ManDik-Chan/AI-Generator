/*
 * Metadata of the public landing page. The page has one route and two languages:
 * Chinese at "/" and English at "/?lang=en" (a cookie only remembers a visitor's choice;
 * crawlers never carry it). Each language therefore canonicalises to its own URL and the
 * pair is linked with hreflang, so the English page is not folded into the Chinese one.
 * Moving to path-based locales (/en) is a separate product decision.
 */
import type { Metadata } from "next";

import { landingCopy, type LandingLang } from "@/features/landing/content";
import { socialImage } from "@/features/seo/social-image";
import { absoluteUrl, SITE_NAME } from "@/lib/site";

export const LANDING_PATHS: Record<LandingLang, string> = { zh: "/", en: "/?lang=en" };

/** hreflang map shared by the page metadata and the sitemap. */
export const LANDING_LANGUAGES = { "zh-CN": LANDING_PATHS.zh, en: LANDING_PATHS.en, "x-default": LANDING_PATHS.zh } as const;

export const OG_LOCALES: Record<LandingLang, string> = { zh: "zh_CN", en: "en_US" };

export function landingMetadata(lang: LandingLang): Metadata {
  const { title, description } = landingCopy[lang].meta;
  const other: LandingLang = lang === "zh" ? "en" : "zh";
  const image = { ...socialImage(lang), url: absoluteUrl(socialImage(lang).url) };
  return {
    // With a metadataBase, Next 15 resolves any URL whose path is "/" to the bare origin and
    // drops its query, which would turn "/?lang=en" into "/". Without one, absolute URLs are
    // emitted verbatim, so this page passes absolute URLs only.
    metadataBase: null,
    title: { absolute: title },
    description,
    alternates: {
      canonical: absoluteUrl(LANDING_PATHS[lang]),
      languages: Object.fromEntries(Object.entries(LANDING_LANGUAGES).map(([key, path]) => [key, absoluteUrl(path)])),
    },
    // A page-level openGraph replaces the layout's, so every field is restated here.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: absoluteUrl(LANDING_PATHS[lang]),
      locale: OG_LOCALES[lang],
      alternateLocale: [OG_LOCALES[other]],
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
