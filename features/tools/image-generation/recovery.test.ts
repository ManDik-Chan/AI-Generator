import { describe, expect, it } from "vitest";

import { resolveRecoveryGeneratedImage } from "@/features/tools/queries";

const image = { id: "image-id", prompt: "真实数据库描述", width: 1280, height: 1280, createdAt: new Date("2026-07-17T01:02:03.000Z") };

describe("image generation recovery DTO", () => {
  it("returns the real prompt, style and createdAt from durable data", () => {
    expect(resolveRecoveryGeneratedImage("IMAGE_GENERATE", { style: "CINEMATIC", size: "1280x1280" }, image)).toEqual({
      id: "image-id",
      prompt: "真实数据库描述",
      style: "CINEMATIC",
      width: 1280,
      height: 1280,
      createdAt: "2026-07-17T01:02:03.000Z",
      previewUrl: "/api/generated-images/image-id",
      downloadUrl: "/api/generated-images/image-id?download=1",
    });
  });

  it("safely falls back to AUTO for invalid stored options", () => {
    expect(resolveRecoveryGeneratedImage("IMAGE_GENERATE", { style: "FORGED" }, image)?.style).toBe("AUTO");
  });

  it("does not expose storage or provider fields", () => {
    const dto = resolveRecoveryGeneratedImage("IMAGE_GENERATE", { style: "AUTO", size: "1280x1280" }, image);
    expect(dto).not.toHaveProperty("storagePath");
    expect(dto).not.toHaveProperty("storageBucket");
    expect(dto).not.toHaveProperty("provider");
    expect(dto).not.toHaveProperty("userId");
  });
});
