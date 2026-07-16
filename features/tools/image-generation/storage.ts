import "server-only";

import { ImageProviderError } from "@/lib/ai/image/errors";
import { requireGeneratedImageStorageConfig } from "@/lib/ai/image/config";
import { createSupabaseAdminClient } from "@/lib/auth/supabase/admin";
import { isTrustedGeneratedImageStorageTarget, resolveGeneratedImageStorageTarget, type TrustedGeneratedImageStorageTarget } from "@/features/generated-images/storage-target";

export function buildGeneratedImageStoragePath(
  userId: string,
  imageId: string,
  extension: string,
) {
  return `${userId}/${imageId}.${extension}`;
}

export async function uploadGeneratedImage(
  userId: string,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const { bucket } = requireGeneratedImageStorageConfig();
  const target = resolveGeneratedImageStorageTarget({ userId, kind: "TOOL_GENERATION", storedBucket: bucket, storedPath: path });
  if (!target) throw new ImageProviderError("STORAGE", "Generated image storage target is invalid");
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(target.bucket).upload(target.path, bytes, {
    contentType: mimeType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw new ImageProviderError("STORAGE", "Generated image upload failed");
  return target;
}

export async function removeGeneratedImageObject(
  target: TrustedGeneratedImageStorageTarget,
) {
  if (!isTrustedGeneratedImageStorageTarget(target)) throw new ImageProviderError("STORAGE", "Generated image storage target is invalid");
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(target.bucket).remove([target.path]);
  if (error) throw new ImageProviderError("STORAGE", "Generated image deletion failed");
}

export async function createGeneratedImageSignedUrl(
  target: TrustedGeneratedImageStorageTarget,
  downloadName?: string,
) {
  if (!isTrustedGeneratedImageStorageTarget(target)) throw new ImageProviderError("STORAGE", "Generated image storage target is invalid");
  const client = createSupabaseAdminClient();
  const { data, error } = await client.storage
    .from(target.bucket)
    .createSignedUrl(target.path, 60, downloadName ? { download: downloadName } : undefined);
  if (error || !data.signedUrl) {
    throw new ImageProviderError("STORAGE", "Generated image preview failed");
  }
  return data.signedUrl;
}
