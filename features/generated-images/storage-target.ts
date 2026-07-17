import "server-only";

import {
  requireAvatarStorageConfig,
  requireGeneratedImageStorageConfig,
} from "@/lib/ai/image/config";

export type GeneratedImageStorageKind = "PERSONA_AVATAR" | "TOOL_GENERATION";

const trustedStorageTarget: unique symbol = Symbol("trusted-generated-image-storage-target");

export interface TrustedGeneratedImageStorageTarget {
  readonly bucket: string;
  readonly path: string;
  readonly kind: GeneratedImageStorageKind;
  readonly [trustedStorageTarget]: true;
}

interface StoredTargetInput {
  userId: string;
  kind: GeneratedImageStorageKind;
  storedBucket: unknown;
  storedPath: unknown;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const SAFE_IMAGE_FILE = /^[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/i;

function trustedBucket(kind: GeneratedImageStorageKind) {
  return kind === "PERSONA_AVATAR"
    ? requireAvatarStorageConfig().bucket
    : requireGeneratedImageStorageConfig().bucket;
}

function isSafeOwnedPath(userId: string, kind: GeneratedImageStorageKind, path: string) {
  if (!path || path.length > 512 || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  if (path.includes("%")) {
    try {
      if (decodeURIComponent(path) !== path) return false;
    } catch {
      return false;
    }
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  if (segments[0] !== userId || !SAFE_SEGMENT.test(segments[0])) return false;
  if (kind === "PERSONA_AVATAR") {
    return segments.length === 3 && SAFE_SEGMENT.test(segments[1]) && SAFE_IMAGE_FILE.test(segments[2]);
  }
  return segments.length === 2 && SAFE_IMAGE_FILE.test(segments[1]);
}

export function resolveGeneratedImageStorageTarget(input: StoredTargetInput): TrustedGeneratedImageStorageTarget | null {
  if (typeof input.storedBucket !== "string" || typeof input.storedPath !== "string") return null;
  const bucket = trustedBucket(input.kind);
  if (input.storedBucket !== bucket || !isSafeOwnedPath(input.userId, input.kind, input.storedPath)) return null;
  return { bucket, path: input.storedPath, kind: input.kind, [trustedStorageTarget]: true };
}

export function isTrustedGeneratedImageStorageTarget(target: TrustedGeneratedImageStorageTarget) {
  return target?.[trustedStorageTarget] === true;
}
