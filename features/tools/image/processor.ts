import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export type SafeImageMime = "image/jpeg" | "image/png" | "image/webp";

export class UnsafeUploadError extends Error { constructor(public code: "EMPTY" | "TOO_LARGE" | "UNSUPPORTED" | "MISMATCH" | "PIXELS" | "CORRUPT", message: string) { super(message); this.name = "UnsafeUploadError"; } }
const normalize = (value: string) => ({ "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg" }[value.toLowerCase().split(";")[0].trim()] ?? value.toLowerCase().split(";")[0].trim());
export function detectUploadMime(bytes: Uint8Array): SafeImageMime | undefined {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0,4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8,12)).toString() === "WEBP") return "image/webp";
}

export function assertSafePixelCount(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > MAX_IMAGE_PIXELS) throw new UnsafeUploadError("PIXELS", "图片像素尺寸过大。");
}

export async function processUploadedImage(file: File) {
  if (!file.size) throw new UnsafeUploadError("EMPTY", "图片文件为空。");
  if (file.size > MAX_IMAGE_BYTES) throw new UnsafeUploadError("TOO_LARGE", "图片不能超过 10 MB。");
  const input = new Uint8Array(await file.arrayBuffer());
  const detected = detectUploadMime(input);
  if (!detected) throw new UnsafeUploadError("UNSUPPORTED", "仅支持 PNG、JPEG 和 WebP 图片。");
  const declared = normalize(file.type || "");
  if (!["image/jpeg", "image/png", "image/webp"].includes(declared)) throw new UnsafeUploadError("UNSUPPORTED", "图片 Content-Type 无效。");
  if (declared !== detected) throw new UnsafeUploadError("MISMATCH", "图片类型与实际内容不一致。");
  try {
    const pipeline = sharp(input, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height) throw new UnsafeUploadError("CORRUPT", "无法读取图片尺寸。");
    const decodedMime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : undefined;
    if (decodedMime !== detected) throw new UnsafeUploadError("MISMATCH", "图片解码格式与文件头不一致。");
    assertSafePixelCount(metadata.width, metadata.height);
    let buffer: Buffer;
    if (detected === "image/jpeg") buffer = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    else if (detected === "image/png") buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    else buffer = await pipeline.webp({ quality: 90 }).toBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new UnsafeUploadError("TOO_LARGE", "安全处理后的图片超过 10 MB。");
    return { bytes: new Uint8Array(buffer), mimeType: detected, extension: detected === "image/jpeg" ? "jpg" : detected.split("/")[1], width: metadata.width, height: metadata.height, sizeBytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex") };
  } catch (error) { if (error instanceof UnsafeUploadError) throw error; if (error instanceof Error && /pixel limit|input image exceeds/i.test(error.message)) throw new UnsafeUploadError("PIXELS", "图片像素尺寸过大。"); throw new UnsafeUploadError("CORRUPT", "图片损坏或无法安全解码。"); }
}
