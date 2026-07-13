import { describe, expect, it } from "vitest";
import { getToolAssetConfig, getVisionConfigurationStatus, requireVisionConfig } from "@/lib/ai/vision/config";

const env = { AI_BASE_URL: "https://example.com/v1", AI_API_KEY: "test", AI_VISION_MODEL: "vision-model", AI_TOOL_ASSET_BUCKET: "tool-assets", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-role" };
describe("vision configuration", () => {
  it("uses base/key fallback while requiring an explicit vision model", () => expect(requireVisionConfig(env)).toMatchObject({ baseUrl: env.AI_BASE_URL, model: "vision-model", dailyLimit: 10 }));
  it("builds safely when vision is absent", () => expect(getVisionConfigurationStatus({})).toMatchObject({ configured: false }));
  it("applies private bucket retention defaults", () => expect(getToolAssetConfig(env)).toEqual({ bucket: "tool-assets", retentionDays: 7 }));
});
