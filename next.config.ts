import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL) }];
  },
};

export default nextConfig;
