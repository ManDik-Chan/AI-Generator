import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ImageProviderError, logImageSafetyDiagnostic, type ImageSafetyDiagnostics } from "@/lib/ai/image/errors";

const MAX_BYTES = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BINARY_TYPES = new Set(["", "application/octet-stream", "application/binary"]);
const EXPLICITLY_BLOCKED_TYPES = new Set(["text/html", "text/plain", "application/json", "image/svg+xml"]);
const TYPE_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "binary/octet-stream": "application/octet-stream",
  "application/x-octet-stream": "application/octet-stream",
};

type Lookup = (hostname: string) => Promise<Array<{ address: string }>>;

export interface DownloadRemoteImageOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  fetcher?: typeof fetch;
  lookup?: Lookup;
}

function safetyError(code: "UNSAFE_IMAGE" | "PROXY_DNS" | "UNAVAILABLE", message: string, diagnostics: ImageSafetyDiagnostics, status?: number) {
  return new ImageProviderError(code, message, status, diagnostics);
}

function normalizeContentType(value: string | null) {
  const raw = (value ?? "").split(";")[0].trim().toLowerCase();
  return TYPE_ALIASES[raw] ?? raw;
}

function isUnsafeAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return true;
  if (normalized.startsWith("::ffff:")) return isUnsafeAddress(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}

async function assertSafeUrl(rawUrl: string, lookup: Lookup, redirectCount: number) {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw safetyError("UNSAFE_IMAGE", "Invalid remote image URL", { stage: "url", redirectCount }); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw safetyError("UNSAFE_IMAGE", "Unsafe remote image URL", { stage: "url", hostname, redirectCount });
  }
  if (isIP(hostname)) {
    if (isUnsafeAddress(hostname)) throw safetyError("UNSAFE_IMAGE", "Unsafe remote image address", { stage: "dns", hostname, redirectCount, resolvedAddressClass: "fake-ip-or-private" });
    return url;
  }
  let addresses: Array<{ address: string }>;
  try { addresses = await lookup(hostname); } catch { throw safetyError("UNAVAILABLE", "Remote image DNS lookup failed", { stage: "dns", hostname, redirectCount }); }
  if (!addresses.length) throw safetyError("UNAVAILABLE", "Remote image DNS lookup returned no addresses", { stage: "dns", hostname, redirectCount });
  if (addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw safetyError("PROXY_DNS", "Remote image DNS resolved to a reserved address", { stage: "dns", hostname, redirectCount, resolvedAddressClass: "fake-ip-or-private" });
  }
  return url;
}

function detectImage(bytes: Uint8Array, diagnostics: Omit<ImageSafetyDiagnostics, "stage">) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { mimeType: "image/png", extension: "png" };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mimeType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  throw safetyError("UNSAFE_IMAGE", "Invalid image signature", { stage: "image-signature", ...diagnostics });
}

export async function downloadRemoteImageSafely(rawUrl: string, options: DownloadRemoteImageOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const lookup: Lookup = options.lookup ?? (async (hostname) => dnsLookup(hostname, { all: true }));
  const controller = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 60_000);
  const abort = () => controller.abort(); options.signal?.addEventListener("abort", abort, { once: true });
  try {
    let current = rawUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const url = await assertSafeUrl(current, lookup, redirects); const hostname = url.hostname.toLowerCase();
      const response = await fetcher(url, { redirect: "manual", signal: controller.signal, headers: { Accept: "image/png,image/jpeg,image/webp" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw safetyError("UNSAFE_IMAGE", "Invalid image redirect", { stage: "redirect", hostname, status: response.status, redirectCount: redirects });
        try { current = new URL(location, url).toString(); } catch { throw safetyError("UNSAFE_IMAGE", "Invalid image redirect URL", { stage: "redirect", hostname, status: response.status, redirectCount: redirects }); }
        continue;
      }
      if (!response.ok || !response.body) throw safetyError("UNAVAILABLE", "Remote image download failed", { stage: "http-status", hostname, status: response.status, redirectCount: redirects }, response.status);
      const declaredLength = Number(response.headers.get("content-length") || 0); const limit = options.maxBytes ?? MAX_BYTES;
      if (declaredLength > limit) throw safetyError("UNSAFE_IMAGE", "Remote image is too large", { stage: "content-length", hostname, redirectCount: redirects, declaredLength });
      const declaredType = normalizeContentType(response.headers.get("content-type"));
      if (EXPLICITLY_BLOCKED_TYPES.has(declaredType) || (!SUPPORTED_IMAGE_TYPES.has(declaredType) && !BINARY_TYPES.has(declaredType))) {
        throw safetyError("UNSAFE_IMAGE", "Invalid image content type", { stage: "content-type", hostname, redirectCount: redirects, declaredType, declaredLength: declaredLength || undefined });
      }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw safetyError("UNSAFE_IMAGE", "Remote image is too large", { stage: "content-length", hostname, redirectCount: redirects, declaredType: declaredType || undefined, declaredLength: declaredLength || undefined, downloadedLength: length }); } chunks.push(value); }
      const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const baseDiagnostics = { hostname, redirectCount: redirects, declaredType: declaredType || undefined, declaredLength: declaredLength || undefined, downloadedLength: length };
      const detected = detectImage(bytes, baseDiagnostics);
      if (SUPPORTED_IMAGE_TYPES.has(declaredType) && declaredType !== detected.mimeType) {
        logImageSafetyDiagnostic(new ImageProviderError("UNSAFE_IMAGE", "Image MIME mismatch accepted using signature", undefined, { stage: "mime-mismatch", ...baseDiagnostics, detectedType: detected.mimeType }));
      }
      return { bytes, ...detected };
    }
    throw safetyError("UNSAFE_IMAGE", "Too many image redirects", { stage: "redirect", redirectCount: 3 });
  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    if (controller.signal.aborted) throw new ImageProviderError(timedOut ? "TIMEOUT" : "ABORTED", "Image download aborted");
    throw new ImageProviderError("UNAVAILABLE", "Remote image download failed");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
