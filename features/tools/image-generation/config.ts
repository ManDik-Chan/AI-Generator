import { getImageGenerationConfigurationStatus } from "@/lib/ai/image/config";

type Env = Record<string, string | undefined>;

export function getImageGenerationDailyLimit(env: Env = process.env) {
  const parsed = Number(env.AI_DAILY_IMAGE_GENERATION_LIMIT);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000
    ? parsed
    : 5;
}

export function getImageGenerationDisplayConfig(env: Env = process.env) {
  const size = env.AI_IMAGE_SIZE?.trim() || "1280x1280";
  return {
    configured: getImageGenerationConfigurationStatus(env).configured,
    size: /^\d+x\d+$/.test(size) ? size : "配置无效",
    dailyLimit: getImageGenerationDailyLimit(env),
  };
}
