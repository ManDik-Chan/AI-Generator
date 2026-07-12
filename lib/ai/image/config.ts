import "server-only";

import { ImageProviderError } from "@/lib/ai/image/errors";

type ServerEnv = Record<string, string | undefined>;

export function getImageConfigurationStatus(env: ServerEnv = process.env) {
  const key = env.AI_IMAGE_API_KEY?.trim() || env.AI_API_KEY?.trim();
  const base = env.AI_IMAGE_BASE_URL?.trim() || env.AI_BASE_URL?.trim();
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const provider = env.AI_IMAGE_PROVIDER?.trim() || "zhipu-glm-image";
  const providerSupported = provider === "zhipu-glm-image";
  return {
    configured: Boolean(key && base && service && providerSupported),
    missing: [!key && "AI_IMAGE_API_KEY", !base && "AI_IMAGE_BASE_URL", !service && "SUPABASE_SERVICE_ROLE_KEY", !providerSupported && "AI_IMAGE_PROVIDER"].filter(Boolean),
    providerSupported,
  };
}

export function requireAvatarStorageConfig(env: ServerEnv = process.env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) throw new ImageProviderError("STORAGE", "Supabase avatar storage is not configured");
  return { bucket: env.SUPABASE_PERSONA_AVATAR_BUCKET?.trim() || "persona-avatars" } as const;
}

export function requireImageConfig(env: ServerEnv = process.env) {
  if (!getImageConfigurationStatus(env).configured) throw new ImageProviderError("CONFIGURATION", "Image configuration incomplete");
  const size = env.AI_IMAGE_SIZE?.trim() || "1280x1280";
  if (!/^\d+x\d+$/.test(size)) throw new ImageProviderError("CONFIGURATION", "Invalid image size");
  const timeout = Number(env.AI_IMAGE_REQUEST_TIMEOUT_MS);
  return {
    provider: "zhipu-glm-image",
    baseUrl: env.AI_IMAGE_BASE_URL?.trim() || env.AI_BASE_URL!.trim(),
    apiKey: env.AI_IMAGE_API_KEY?.trim() || env.AI_API_KEY!.trim(),
    model: env.AI_IMAGE_MODEL?.trim() || "glm-image",
    size,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 180_000,
    bucket: env.SUPABASE_PERSONA_AVATAR_BUCKET?.trim() || "persona-avatars",
  } as const;
}
