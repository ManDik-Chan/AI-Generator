import "server-only";

import { requireAvatarStorageConfig } from "@/lib/ai/image/config";
import { ImageProviderError } from "@/lib/ai/image/errors";
import { createSupabaseAdminClient } from "@/lib/auth/supabase/admin";

export function buildPersonaAvatarStoragePath(userId: string, personaId: string, imageId: string, extension: string) {
  return `${userId}/${personaId}/${imageId}.${extension}`;
}

export async function uploadPersonaAvatar(path: string, bytes: Uint8Array, contentType: string) {
  const { bucket } = requireAvatarStorageConfig(); const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
  if (error) throw new ImageProviderError("STORAGE", "Avatar upload failed");
}

export async function removePersonaAvatar(path: string) {
  const { bucket } = requireAvatarStorageConfig(); const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw new ImageProviderError("STORAGE", "Avatar deletion failed");
}

export async function createPersonaAvatarSignedUrl(path: string) {
  const { bucket } = requireAvatarStorageConfig(); const client = createSupabaseAdminClient();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data.signedUrl) throw new ImageProviderError("STORAGE", "Avatar preview failed");
  return data.signedUrl;
}
