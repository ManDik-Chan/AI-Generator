import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/image/config", () => ({
  requireAvatarStorageConfig: () => ({ bucket: "persona-avatars" }),
  requireGeneratedImageStorageConfig: () => ({ bucket: "generated-images" }),
}));

import { resolveGeneratedImageStorageTarget } from "@/features/generated-images/storage-target";

const userId = "owner-123";

describe("trusted GeneratedImage Storage target", () => {
  it("resolves existing Persona paths only to the configured avatar bucket", () => {
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "PERSONA_AVATAR", storedBucket: "persona-avatars", storedPath: `${userId}/persona-1/image-1.jpeg` })).toMatchObject({ bucket: "persona-avatars", path: `${userId}/persona-1/image-1.jpeg`, kind: "PERSONA_AVATAR" });
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "PERSONA_AVATAR", storedBucket: "generated-images", storedPath: `${userId}/persona-1/image-1.jpeg` })).toBeNull();
  });

  it("resolves tool images only to the configured generated image bucket", () => {
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "TOOL_GENERATION", storedBucket: "generated-images", storedPath: `${userId}/image-1.webp` })).toMatchObject({ bucket: "generated-images", path: `${userId}/image-1.webp`, kind: "TOOL_GENERATION" });
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "TOOL_GENERATION", storedBucket: "persona-avatars", storedPath: `${userId}/image-1.webp` })).toBeNull();
  });

  it("rejects paths belonging to another user", () => {
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "TOOL_GENERATION", storedBucket: "generated-images", storedPath: "other-user/image.png" })).toBeNull();
  });

  it.each([
    `${userId}/../image.png`,
    `${userId}\\image.png`,
    `/${userId}/image.png`,
    `${userId}/image.png\0suffix`,
    `${userId}/%2e%2e/image.png`,
    `${userId}%2fother/image.png`,
    `${userId}/image%2epng`,
  ])("rejects traversal or encoded path %s", (storedPath) => {
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "TOOL_GENERATION", storedBucket: "generated-images", storedPath })).toBeNull();
  });

  it("rejects malformed kind-specific shapes and unsupported extensions", () => {
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "PERSONA_AVATAR", storedBucket: "persona-avatars", storedPath: `${userId}/image.png` })).toBeNull();
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "TOOL_GENERATION", storedBucket: "generated-images", storedPath: `${userId}/persona/image.png` })).toBeNull();
    expect(resolveGeneratedImageStorageTarget({ userId, kind: "TOOL_GENERATION", storedBucket: "generated-images", storedPath: `${userId}/image.svg` })).toBeNull();
  });
});
