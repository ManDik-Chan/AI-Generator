import "server-only";

import { requireAvatarStorageConfig } from "@/lib/ai/image/config";
import { ImageProviderError } from "@/lib/ai/image/errors";
import { createSupabaseAdminClient } from "@/lib/auth/supabase/admin";
import { isTrustedGeneratedImageStorageTarget, resolveGeneratedImageStorageTarget, type TrustedGeneratedImageStorageTarget } from "@/features/generated-images/storage-target";

export function buildPersonaAvatarStoragePath(userId: string, personaId: string, imageId: string, extension: string) {
  return `${userId}/${personaId}/${imageId}.${extension}`;
}

export async function uploadPersonaAvatar(userId: string, path: string, bytes: Uint8Array, contentType: string) {
  const { bucket } = requireAvatarStorageConfig(); const client = createSupabaseAdminClient();
  const target = resolveGeneratedImageStorageTarget({ userId, kind: "PERSONA_AVATAR", storedBucket: bucket, storedPath: path });
  if (!target) throw new ImageProviderError("STORAGE", "Avatar storage target is invalid");
  const { error } = await client.storage.from(target.bucket).upload(target.path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw new ImageProviderError("STORAGE", "Avatar upload failed");
  return target;
}

export async function removePersonaAvatar(target: TrustedGeneratedImageStorageTarget) {
  if (!isTrustedGeneratedImageStorageTarget(target)) throw new ImageProviderError("STORAGE", "Avatar storage target is invalid");
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(target.bucket).remove([target.path]);
  if (error) throw new ImageProviderError("STORAGE", "Avatar deletion failed");
}

export async function createPersonaAvatarSignedUrl(target: TrustedGeneratedImageStorageTarget) {
  if (!isTrustedGeneratedImageStorageTarget(target)) throw new ImageProviderError("STORAGE", "Avatar storage target is invalid");
  const client = createSupabaseAdminClient();
  const { data, error } = await client.storage.from(target.bucket).createSignedUrl(target.path, 60);
  if (error || !data.signedUrl) throw new ImageProviderError("STORAGE", "Avatar preview failed");
  return data.signedUrl;
}
