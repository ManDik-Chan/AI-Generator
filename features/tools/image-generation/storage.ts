import "server-only";

import { ImageProviderError } from "@/lib/ai/image/errors";
import { requireGeneratedImageStorageConfig } from "@/lib/ai/image/config";
import { createSupabaseAdminClient } from "@/lib/auth/supabase/admin";

export function buildGeneratedImageStoragePath(
  userId: string,
  imageId: string,
  extension: string,
) {
  return `${userId}/${imageId}.${extension}`;
}

export async function uploadGeneratedImage(
  path: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const { bucket } = requireGeneratedImageStorageConfig();
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(bucket).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) throw new ImageProviderError("STORAGE", "Generated image upload failed");
  return bucket;
}

export async function removeGeneratedImageObject(
  bucket: string,
  path: string,
) {
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw new ImageProviderError("STORAGE", "Generated image deletion failed");
}

export async function createGeneratedImageSignedUrl(
  bucket: string,
  path: string,
  downloadName?: string,
) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, 60, downloadName ? { download: downloadName } : undefined);
  if (error || !data.signedUrl) {
    throw new ImageProviderError("STORAGE", "Generated image preview failed");
  }
  return data.signedUrl;
}
