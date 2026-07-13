import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { assertSafePixelCount, detectUploadMime, MAX_IMAGE_BYTES, processUploadedImage, UnsafeUploadError } from "@/features/tools/image/processor";

async function image(format: "jpeg" | "png" | "webp") { return sharp({ create: { width: 8, height: 6, channels: 3, background: "#22aa66" } })[format]().withMetadata({ orientation: 6 }).toBuffer(); }

describe("secure tool image processing", () => {
  it.each(["jpeg", "png", "webp"] as const)("decodes and sanitizes %s", async (format) => { const bytes = await image(format); const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`; const result = await processUploadedImage(new File([bytes], `test.${format}`, { type: mime })); expect(result.mimeType).toBe(mime); expect(result.sha256).toMatch(/^[0-9a-f]{64}$/); expect(await sharp(result.bytes).metadata()).not.toHaveProperty("exif"); });
  it("rejects empty and oversized files", async () => { await expect(processUploadedImage(new File([], "empty.png", { type: "image/png" }))).rejects.toMatchObject({ code: "EMPTY" }); await expect(processUploadedImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.png", { type: "image/png" }))).rejects.toMatchObject({ code: "TOO_LARGE" }); });
  it("rejects HTML, SVG, JSON, text, unknown and corrupt bytes", async () => { for (const value of ["<html>x", "<svg></svg>", '{"x":1}', "plain text", "GIF89a", "\u0089PNG\r\n\u001a\ncorrupt"]) await expect(processUploadedImage(new File([value], "bad.bin", { type: "application/octet-stream" }))).rejects.toBeInstanceOf(UnsafeUploadError); });
  it("rejects MIME and magic mismatch", async () => { const bytes = await image("png"); await expect(processUploadedImage(new File([bytes], "fake.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "MISMATCH" }); });
  it("detects only supported signatures", async () => { expect(detectUploadMime(await image("jpeg"))).toBe("image/jpeg"); expect(detectUploadMime(new TextEncoder().encode("<svg>"))).toBeUndefined(); });
  it("rejects decompression-bomb pixel dimensions", () => expect(() => assertSafePixelCount(10_000, 10_000)).toThrow(expect.objectContaining({ code: "PIXELS" })));
});
