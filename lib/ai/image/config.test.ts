import { describe, expect, it } from "vitest";
import { getImageConfigurationStatus, requireAvatarStorageConfig, requireImageConfig } from "@/lib/ai/image/config";

describe("image configuration", () => {
  it("reports missing image and storage secrets without throwing during build", () => expect(getImageConfigurationStatus({})).toMatchObject({ configured: false, providerSupported: true }));
  it("falls back to the text API key and base URL", () => expect(requireImageConfig({ AI_API_KEY: "key", AI_BASE_URL: "https://example.com/v4", SUPABASE_SERVICE_ROLE_KEY: "role" })).toMatchObject({ model: "glm-image", size: "1280x1280" }));
  it("rejects unsupported image providers", () => expect(() => requireImageConfig({ AI_IMAGE_PROVIDER: "other", AI_IMAGE_API_KEY: "key", AI_IMAGE_BASE_URL: "https://example.com", SUPABASE_SERVICE_ROLE_KEY: "role" })).toThrow());
  it("can read existing private avatars without an image provider key", () => expect(requireAvatarStorageConfig({ SUPABASE_SERVICE_ROLE_KEY: "role" })).toEqual({ bucket: "persona-avatars" }));
});
