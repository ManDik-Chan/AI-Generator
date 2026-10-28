import "server-only";

import { requireAvatarStorageConfig } from "@/lib/ai/image/config";
import { ImageProviderError } from "@/lib/ai/image/errors";
import { createSupabaseAdminClient } from "@/lib/auth/supabase/admin";
import { isTrustedGeneratedImageStorageTarget, resolveGeneratedImageStorageTarget, type TrustedGeneratedImageStorageTarget } from "@/features/generated-images/storage-target";
import { reserveObject, deletePendingObjectBytes } from "@/features/storage/deletion";

export function buildPersonaAvatarStoragePath(userId: string, personaId: string, imageId: string, extension: string) {
  return `${userId}/${personaId}/${imageId}.${extension}`;
}

export async function uploadPersonaAvatar(userId: string, path: string, bytes: Uint8Array, contentType: string) {
  const { bucket } = requireAvatarStorageConfig(); const client = createSupabaseAdminClient();
  const target = resolveGeneratedImageStorageTarget({ userId, kind: "PERSONA_AVATAR", storedBucket: bucket, storedPath: path });
  if (!target) throw new ImageProviderError("STORAGE", "Avatar storage target is invalid");
  await reserveObject({ kind: "PERSONA_AVATAR", ownerId: userId, resourceId: path.split("/")[2].split(".")[0], scopeId: path.split("/")[1], bucket: target.bucket, path });
  const { error } = await client.storage.from(target.bucket).upload(target.path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw new ImageProviderError("STORAGE", "Avatar upload failed");
  return target;
}

export async function removePersonaAvatar(target: TrustedGeneratedImageStorageTarget) {
  if (!isTrustedGeneratedImageStorageTarget(target)) throw new ImageProviderError("STORAGE", "Avatar storage target is invalid");
  await deletePendingObjectBytes(target.bucket, target.path);
}

export async function createPersonaAvatarSignedUrl(target: TrustedGeneratedImageStorageTarget) {
  if (!isTrustedGeneratedImageStorageTarget(target)) throw new ImageProviderError("STORAGE", "Avatar storage target is invalid");
  const client = createSupabaseAdminClient();
  const { data, error } = await client.storage.from(target.bucket).createSignedUrl(target.path, 60);
  if (error || !data.signedUrl) throw new ImageProviderError("STORAGE", "Avatar preview failed");
  return data.signedUrl;
}
