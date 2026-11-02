import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  reactStrictMode: true,
  // Always render <title>, canonical and Open Graph tags inside <head>. Next streams async
  // metadata into <body> for user agents outside its built-in bot list (WeChat, Googlebot,
  // unknown link-preview fetchers); every generateMetadata here is synchronous data, so
  // blocking costs nothing.
  htmlLimitedBots: /.*/,
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL) }];
  },
};

export default nextConfig;
