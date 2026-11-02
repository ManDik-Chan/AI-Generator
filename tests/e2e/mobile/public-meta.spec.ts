import { expect, test } from "@playwright/test";

import { verifyPublicMeta } from "../../seo/public-meta-contract";

// Existing CI matrix only; this file grants no local browser permission. Request-only:
// it uses no page fixture, so no browser is launched for it.
test.use({ storageState: { cookies: [], origins: [] } });

test("robots.txt, sitemap.xml, page metadata and share images keep one public index boundary", async ({ baseURL }) => {
  test.setTimeout(120_000);
  const summary = await verifyPublicMeta(baseURL ?? "http://127.0.0.1:3000");
  expect(summary.sitemapUrls).toBeGreaterThan(10);
  expect(summary.images).toEqual(["/og/ai-generator-zh.jpg", "/og/ai-generator-en.jpg"]);
});
