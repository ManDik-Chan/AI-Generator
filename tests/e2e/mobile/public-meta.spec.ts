import { expect, test } from "@playwright/test";

import { verifyPublicMeta } from "../../seo/public-meta-contract";

// Existing CI matrix only; this file grants no local browser permission. Request-only:
// it uses no page fixture, so no browser is launched for it.
test.use({ storageState: { cookies: [], origins: [] } });

test("robots.txt, sitemap.xml, page metadata and share images keep one public index boundary", async ({ baseURL }) => {
  test.setTimeout(120_000);
  // Global setup signs in through the real login form before any spec, so this shared
  // `next start` server already answers 404 for `dynamicParams = false` detail pages
  // (see VerifyOptions.detailPages). Those pages are checked by
  // scripts/verify-public-meta.ts against a fresh server; their sitemap entries are still checked here.
  const summary = await verifyPublicMeta(baseURL ?? "http://127.0.0.1:3000", { detailPages: false });
  expect(summary.sitemapUrls).toBeGreaterThan(10);
  expect(summary.pagesChecked).toBeGreaterThanOrEqual(12);
  expect(summary.images).toEqual(["/og/ai-generator-zh.jpg", "/og/ai-generator-en.jpg"]);
});
