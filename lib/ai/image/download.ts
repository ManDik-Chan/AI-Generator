import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ImageProviderError } from "@/lib/ai/image/errors";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/octet-stream"]);

type Lookup = (hostname: string) => Promise<Array<{ address: string }>>;

export interface DownloadRemoteImageOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  fetcher?: typeof fetch;
  lookup?: Lookup;
}

function isUnsafeAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) return isUnsafeAddress(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function assertSafeUrl(rawUrl: string, lookup: Lookup) {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new ImageProviderError("UNSAFE_IMAGE", "Invalid remote image URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new ImageProviderError("UNSAFE_IMAGE", "Unsafe remote image URL");
  }
  const literal = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname);
  if (!literal.length || literal.some(({ address }) => isUnsafeAddress(address))) throw new ImageProviderError("UNSAFE_IMAGE", "Unsafe remote image address");
  return url;
}

function detectImage(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return { mimeType: "image/png", extension: "png" };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mimeType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  throw new ImageProviderError("UNSAFE_IMAGE", "Invalid image signature");
}

export async function downloadRemoteImageSafely(rawUrl: string, options: DownloadRemoteImageOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const lookup: Lookup = options.lookup ?? (async (hostname) => dnsLookup(hostname, { all: true }));
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 60_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    let current = rawUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const url = await assertSafeUrl(current, lookup);
      const response = await fetcher(url, { redirect: "manual", signal: controller.signal, headers: { Accept: "image/png,image/jpeg,image/webp" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new ImageProviderError("UNSAFE_IMAGE", "Too many image redirects");
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok || !response.body) throw new ImageProviderError("UNAVAILABLE", "Remote image download failed");
      const declaredLength = Number(response.headers.get("content-length") || 0);
      const limit = options.maxBytes ?? MAX_BYTES;
      if (declaredLength > limit) throw new ImageProviderError("UNSAFE_IMAGE", "Remote image is too large");
      const declaredType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(declaredType)) throw new ImageProviderError("UNSAFE_IMAGE", "Invalid image content type");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new ImageProviderError("UNSAFE_IMAGE", "Remote image is too large"); } chunks.push(value); }
      const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const detected = detectImage(bytes);
      if (declaredType !== "application/octet-stream" && declaredType !== detected.mimeType) throw new ImageProviderError("UNSAFE_IMAGE", "Image type mismatch");
      return { bytes, ...detected };
    }
    throw new ImageProviderError("UNSAFE_IMAGE", "Too many image redirects");
  } catch (error) {
    if (error instanceof ImageProviderError) throw error;
    if (controller.signal.aborted) throw new ImageProviderError(timedOut ? "TIMEOUT" : "ABORTED", "Image download aborted");
    throw new ImageProviderError("UNAVAILABLE", "Remote image download failed");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
