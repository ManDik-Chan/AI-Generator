import "server-only";

import { getToolAssetConfig } from "@/lib/ai/vision/config";
import { createSupabaseAdminClient } from "@/lib/auth/supabase/admin";

export function buildToolAssetPath(userId: string, runId: string, extension: string) { return `${userId}/${runId}/${crypto.randomUUID()}.${extension}`; }
export async function uploadToolAsset(path: string, bytes: Uint8Array, mimeType: string) {
  const { bucket } = getToolAssetConfig(); const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType: mimeType, upsert: false, cacheControl: "3600" });
  if (error) throw new Error("TOOL_ASSET_UPLOAD_FAILED");
}
export async function downloadToolAsset(path: string) {
  const { bucket } = getToolAssetConfig(); const client = createSupabaseAdminClient();
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) throw new Error("TOOL_ASSET_DOWNLOAD_FAILED");
  return new Uint8Array(await data.arrayBuffer());
}
export async function createToolAssetSignedUrl(path: string) {
  const { bucket } = getToolAssetConfig(); const client = createSupabaseAdminClient();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data.signedUrl) throw new Error("TOOL_ASSET_PREVIEW_FAILED");
  return data.signedUrl;
}
export async function removeToolAssets(paths: string[]) {
  if (!paths.length) return;
  const { bucket } = getToolAssetConfig(); const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) throw new Error("TOOL_ASSET_DELETE_FAILED");
}
