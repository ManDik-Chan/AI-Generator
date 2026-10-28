import "server-only";
import { getToolAssetConfig } from "@/lib/ai/vision/config";
import { requireAvatarStorageConfig, requireGeneratedImageStorageConfig } from "@/lib/ai/image/config";

export type AssetKind = "TOOL_ASSET" | "TOOL_GENERATION" | "PERSONA_AVATAR";
export interface ObjectIdentity { kind: AssetKind; ownerId: string; resourceId: string; scopeId: string | null; bucket: string; path: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function configuredBucket(kind: AssetKind) {
  const value = kind === "TOOL_ASSET" ? getToolAssetConfig().bucket : kind === "PERSONA_AVATAR" ? requireAvatarStorageConfig().bucket : requireGeneratedImageStorageConfig().bucket;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("INVALID_STORAGE_BUCKET");
  return value;
}
// A current bucket setting is not evidence of a legacy object's location.
// Operators must explicitly attest the historical mapping; absent that, deny.
export function authorizedToolAssetBucket(stored: string | null) {
  if (stored !== null) return stored;
  const legacy = process.env.AI_TOOL_ASSET_LEGACY_BUCKET?.trim();
  return legacy && legacy === configuredBucket("TOOL_ASSET") ? legacy : "";
}
// Reject encodings rather than decoding into another principal's namespace.
// Exact reconstruction binds every segment to identity, not startsWith(owner).
export function validateObjectIdentity(value: ObjectIdentity) {
  if (!uuid.test(value.ownerId) || !uuid.test(value.resourceId) || value.bucket !== configuredBucket(value.kind)) return false;
  const segments = value.path.split("/");
  const file = segments.at(-1)?.match(/^([0-9a-f-]{36})\.(png|jpg|jpeg|webp)$/);
  if (!file || !uuid.test(file[1])) return false;
  if (value.kind === "TOOL_GENERATION") return file[1] === value.resourceId && value.scopeId === null && value.path === `${value.ownerId}/${value.resourceId}.${file[2]}`;
  if (!value.scopeId || !uuid.test(value.scopeId)) return false;
  if (value.kind === "PERSONA_AVATAR" && file[1] !== value.resourceId) return false;
  return value.path === `${value.ownerId}/${value.scopeId}/${file[1]}.${file[2]}`;
}
