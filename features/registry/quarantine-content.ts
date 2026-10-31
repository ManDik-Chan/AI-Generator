import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";

export const QUARANTINE_POLICY_REVISION = 1;
export const SANITIZER_REVISION = "candidate-normalization-v1";
export const SCANNER_REVISION = "unavailable-v1";
export const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
export const digestBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** These are private candidates, never a security approval or publishable output. */
export async function normalizeRegistryBytes(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_REGISTRY_BYTES) throw new Error("INVALID_CONTENT");
  if (mime === "text/markdown") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // No binary, active document format, embedded HTML or control characters.
    // Markdown links/free text still need independent security/content scanning.
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/u.test(text)) throw new Error("INVALID_CONTENT");
    const candidate = Buffer.from(text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").normalize("NFC"), "utf8");
    if (!candidate.length || candidate.length > MAX_REGISTRY_BYTES) throw new Error("INVALID_CONTENT");
    return { bytes: candidate, mime: "text/markdown" };
  }
  const formats: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };
  if (!formats[mime]) throw new Error("INVALID_CONTENT");
  const image = sharp(bytes, { failOn: "warning", limitInputPixels: 16_000_000, pages: 1 }).timeout({ seconds: 3 });
  const metadata = await image.metadata();
  if (metadata.format !== formats[mime] || (metadata.pages ?? 1) !== 1) throw new Error("INVALID_CONTENT");
  // Full decode/reencode strips container metadata. No SVG, animation or passthrough.
  const candidate = await image.rotate().png().toBuffer();
  if (!candidate.length || candidate.length > MAX_REGISTRY_BYTES) throw new Error("INVALID_CONTENT");
  return { bytes: candidate, mime: "image/png" };
}
