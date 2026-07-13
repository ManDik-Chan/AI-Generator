import { AiProviderError } from "@/lib/ai/errors";
import type { VisionConfig } from "@/lib/ai/vision/types";

type Env = Record<string, string | undefined>;
const number = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value); return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export function getVisionConfigurationStatus(env: Env = process.env) {
  const baseUrl = env.AI_VISION_BASE_URL?.trim() || env.AI_BASE_URL?.trim();
  const apiKey = env.AI_VISION_API_KEY?.trim() || env.AI_API_KEY?.trim();
  const model = env.AI_VISION_MODEL?.trim();
  const bucket = env.AI_TOOL_ASSET_BUCKET?.trim();
  const storage = env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return { configured: Boolean(baseUrl && apiKey && model && bucket && storage), missing: [!baseUrl && "AI_VISION_BASE_URL", !apiKey && "AI_VISION_API_KEY", !model && "AI_VISION_MODEL", !bucket && "AI_TOOL_ASSET_BUCKET", !storage && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean) };
}

export function requireVisionConfig(env: Env = process.env): VisionConfig {
  if (!getVisionConfigurationStatus(env).configured) throw new AiProviderError("CONFIGURATION", "Vision service is not configured");
  return {
    provider: "openai-compatible",
    baseUrl: (env.AI_VISION_BASE_URL || env.AI_BASE_URL)!.trim(),
    apiKey: (env.AI_VISION_API_KEY || env.AI_API_KEY)!.trim(),
    model: env.AI_VISION_MODEL!.trim(),
    temperature: 0.2,
    maxOutputTokens: number(env.AI_VISION_MAX_OUTPUT_TOKENS, 4096, 1, 40_000),
    requestTimeoutMs: number(env.AI_VISION_REQUEST_TIMEOUT_MS, 120_000, 1_000, 600_000),
    dailyLimit: number(env.AI_DAILY_VISION_LIMIT, 10, 1, 10_000),
  };
}

export function getToolAssetConfig(env: Env = process.env) {
  const bucket = env.AI_TOOL_ASSET_BUCKET?.trim();
  if (!bucket) throw new AiProviderError("CONFIGURATION", "Tool asset bucket is not configured");
  return { bucket, retentionDays: number(env.AI_TOOL_ASSET_RETENTION_DAYS, 7, 1, 365) };
}
