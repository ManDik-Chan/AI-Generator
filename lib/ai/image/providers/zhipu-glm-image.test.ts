import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageProviderError } from "@/lib/ai/image/errors";
import { buildImageGenerationUrl, createZhipuGlmImageProvider } from "@/lib/ai/image/providers/zhipu-glm-image";

const env = { AI_IMAGE_BASE_URL: "https://open.bigmodel.cn/api/paas/v4", AI_IMAGE_API_KEY: "test-key", SUPABASE_SERVICE_ROLE_KEY: "test-role" };
afterEach(() => vi.unstubAllEnvs());
function configure() { Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value)); }

describe("GLM-Image provider", () => {
  it("builds the endpoint exactly once", () => { expect(buildImageGenerationUrl(env.AI_IMAGE_BASE_URL)).toBe("https://open.bigmodel.cn/api/paas/v4/images/generations"); expect(buildImageGenerationUrl(`${env.AI_IMAGE_BASE_URL}/images/generations`)).toBe("https://open.bigmodel.cn/api/paas/v4/images/generations"); });
  it("rejects an unsafe base URL", () => expect(() => buildImageGenerationUrl("http://localhost/v4")).toThrow(ImageProviderError));
  it("sends only model, prompt, and size", async () => { configure(); const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: "https://images.example/avatar.png" }] }), { status: 200 })); const result = await createZhipuGlmImageProvider(fetcher).generateImage({ prompt: "portrait", size: "1280x1280" }); const init = fetcher.mock.calls[0][1]; expect(JSON.parse(String(init.body))).toEqual({ model: "glm-image", prompt: "portrait", size: "1280x1280" }); expect(result).toMatchObject({ provider: "zhipu-glm-image", model: "glm-image", width: 1280, height: 1280 }); });
  it.each([[401,"AUTHENTICATION"],[403,"AUTHENTICATION"],[404,"NOT_FOUND"],[429,"RATE_LIMITED"],[500,"UNAVAILABLE"]])("maps HTTP %i", async (status, code) => { configure(); const provider = createZhipuGlmImageProvider(vi.fn().mockResolvedValue(new Response("bad", { status }))); await expect(provider.generateImage({ prompt: "portrait", size: "1280x1280" })).rejects.toMatchObject({ code }); });
  it("rejects empty data and missing URLs", async () => { configure(); for (const body of [{ data: [] }, { data: [{}] }]) { const provider = createZhipuGlmImageProvider(vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))); await expect(provider.generateImage({ prompt: "portrait", size: "1280x1280" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" }); } });
  it("rejects overlong prompts before a request", async () => { configure(); const fetcher = vi.fn(); await expect(createZhipuGlmImageProvider(fetcher).generateImage({ prompt: "a".repeat(1001), size: "1280x1280" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" }); expect(fetcher).not.toHaveBeenCalled(); });
});
