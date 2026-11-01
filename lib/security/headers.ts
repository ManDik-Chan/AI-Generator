import { createHash } from "node:crypto";

import { themeInitializationScript } from "../theme";

/** Build-time response policy. CSP is a measurement candidate, not enforcement. */
export function buildSecurityHeaders(supabaseUrl?: string) {
  let supabaseOrigin: string | undefined;
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password
        && /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])$/i.test(url.hostname)) {
        supabaseOrigin = url.origin;
      }
    } catch {
      // Missing/invalid configuration must never become CSP source text.
    }
  }
  const remote = supabaseOrigin ? ` ${supabaseOrigin}` : "";
  const reportOnly = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${createHash("sha256").update(themeInitializationScript).digest("base64")}'`,
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'none'",
    `img-src 'self' blob:${remote}`,
    "font-src 'self'",
    `connect-src 'self'${remote}`,
    "worker-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "report-uri /api/security/csp-report",
  ].join("; ");
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), clipboard-read=(), clipboard-write=(self), fullscreen=(self)",
    },
    { key: "Content-Security-Policy-Report-Only", value: reportOnly },
  ];
}
