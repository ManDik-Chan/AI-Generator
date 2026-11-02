import type { MetadataRoute } from "next";

import { ROBOTS_DISALLOW } from "@/features/seo/index-policy";
import { absoluteUrl } from "@/lib/site";

// Crawling advice only; access control stays in middleware and the server (see index-policy.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
