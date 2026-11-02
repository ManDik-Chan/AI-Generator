import { describe, expect, it } from "vitest";

import { landingCopy } from "@/features/landing/content";
import { LANDING_LANGUAGES, LANDING_PATHS, landingMetadata } from "@/features/landing/metadata";
import { SOCIAL_IMAGE, SOCIAL_IMAGE_PATHS } from "@/features/seo/social-image";
import { SITE_ORIGIN } from "@/lib/site";

const url = (path: string) => `${SITE_ORIGIN}${path}`;

describe("landing metadata", () => {
  it.each(["zh", "en"] as const)("canonicalises %s to its own crawlable URL", (lang) => {
    const metadata = landingMetadata(lang);
    expect(LANDING_PATHS).toEqual({ zh: "/", en: "/?lang=en" });
    expect(metadata.alternates?.canonical).toBe(url(LANDING_PATHS[lang]));
    expect(metadata.openGraph).toMatchObject({ url: url(LANDING_PATHS[lang]) });
  });

  it("emits absolute URLs without a metadataBase, so Next keeps the ?lang=en query", () => {
    for (const lang of ["zh", "en"] as const) {
      const metadata = landingMetadata(lang);
      expect(metadata.metadataBase).toBeNull();
      const urls = [metadata.alternates?.canonical, metadata.openGraph?.url, ...Object.values(metadata.alternates?.languages ?? {})];
      for (const value of urls) expect(String(value)).toMatch(new RegExp(`^${SITE_ORIGIN.replace(/\./g, "\\.")}/`));
    }
  });

  it("links both languages with hreflang and an x-default", () => {
    expect(LANDING_LANGUAGES).toEqual({ "zh-CN": "/", en: "/?lang=en", "x-default": "/" });
    for (const lang of ["zh", "en"] as const) {
      expect(landingMetadata(lang).alternates?.languages).toEqual({ "zh-CN": url("/"), en: url("/?lang=en"), "x-default": url("/") });
    }
  });

  it("restates every Open Graph field, because a page-level openGraph replaces the layout's", () => {
    expect(landingMetadata("zh").openGraph).toMatchObject({
      type: "website",
      siteName: "AI-Generator",
      title: landingCopy.zh.meta.title,
      description: landingCopy.zh.meta.description,
      locale: "zh_CN",
      alternateLocale: ["en_US"],
    });
    expect(landingMetadata("en").openGraph).toMatchObject({ locale: "en_US", alternateLocale: ["zh_CN"], title: landingCopy.en.meta.title });
  });

  it.each(["zh", "en"] as const)("shares the %s card with explicit size, type and alt", (lang) => {
    const metadata = landingMetadata(lang);
    const image = { url: url(SOCIAL_IMAGE_PATHS[lang]), width: SOCIAL_IMAGE.width, height: SOCIAL_IMAGE.height, type: "image/jpeg", alt: expect.stringContaining("AI-Generator") };
    expect(metadata.openGraph?.images).toEqual([image]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: landingCopy[lang].meta.title, images: [image] });
  });
});
