import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  transaction: vi.fn(),
  pending: vi.fn(),
  createImage: vi.fn(),
  complete: vi.fn(),
  imageFind: vi.fn(),
  runDelete: vi.fn(),
}));

vi.mock("@/lib/ai/image/registry", () => ({ getImageProvider: () => ({ generateImage: mocks.generate }) }));
vi.mock("@/lib/ai/image/config", () => ({ requireImageConfig: () => ({ size: "1280x1280" }) }));
vi.mock("@/lib/ai/image/download", () => ({ downloadRemoteImageSafely: mocks.download }));
vi.mock("@/features/tools/image-generation/storage", () => ({
  buildGeneratedImageStoragePath: (userId: string, imageId: string, extension: string) => `${userId}/${imageId}.${extension}`,
  uploadGeneratedImage: mocks.upload,
  removeGeneratedImageObject: mocks.remove,
}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
  generatedImage: { findFirst: mocks.imageFind },
  toolRun: { deleteMany: mocks.runDelete },
} }));

import { deleteToolGeneratedImage, generateToolImage } from "@/features/tools/image-generation/service";

describe("tool image generation orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({ remoteUrl: "https://images.example/result.png", provider: "zhipu-glm-image", model: "glm-image", width: 1280, height: 1280 });
    mocks.download.mockImplementation(async (_url, options) => { options?.onProgress?.(); return { bytes: new Uint8Array([137, 80, 78, 71]), mimeType: "image/png", extension: "png" }; });
    mocks.upload.mockResolvedValue("generated-images");
    mocks.remove.mockResolvedValue(undefined);
    mocks.pending.mockResolvedValue({ id: "run" });
    mocks.createImage.mockResolvedValue({ id: "image", prompt: "山间小屋", width: 1280, height: 1280, createdAt: new Date("2026-07-16T00:00:00Z") });
    mocks.complete.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((callback) => callback({ toolRun: { findFirst: mocks.pending, updateMany: mocks.complete }, generatedImage: { create: mocks.createImage } }));
  });

  it("calls the provider exactly once and records all real stages", async () => {
    const stages: string[] = [];
    await expect(generateToolImage({ userId: "owner", runId: "run", prompt: "山间小屋", style: "AUTO", onProgress: (stage) => stages.push(stage) })).resolves.toMatchObject({ id: "image", previewUrl: "/api/generated-images/image" });
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(stages).toEqual(["preparing", "generating", "downloading", "validating", "uploading", "saving"]);
  });

  it("persists a TOOL_GENERATION bound to the owned pending run", async () => {
    await generateToolImage({ userId: "owner", runId: "run", prompt: "山间小屋", style: "CINEMATIC" });
    expect(mocks.pending).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run", userId: "owner", type: "IMAGE_GENERATE", status: "PENDING" } }));
    expect(mocks.createImage).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "owner", kind: "TOOL_GENERATION", toolRunId: "run", storageBucket: "generated-images", mimeType: "image/png" }) }));
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run", userId: "owner", type: "IMAGE_GENERATE", status: "PENDING" } }));
  });

  it("cleans uploaded Storage when the pending run was cancelled", async () => {
    mocks.pending.mockResolvedValue(null);
    await expect(generateToolImage({ userId: "owner", runId: "run", prompt: "山间小屋", style: "AUTO" })).rejects.toMatchObject({ code: "ABORTED" });
    expect(mocks.remove).toHaveBeenCalledWith("generated-images", expect.stringMatching(/^owner\/.+\.png$/));
  });

  it("does not call the provider when already aborted", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(generateToolImage({ userId: "owner", runId: "run", prompt: "山间小屋", style: "AUTO", signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("deletes only an owned tool generation and its ToolRun", async () => {
    mocks.imageFind.mockResolvedValue({ id: "image", storageBucket: "generated-images", storagePath: "owner/image.png", toolRunId: "run" });
    mocks.runDelete.mockResolvedValue({ count: 1 });
    await expect(deleteToolGeneratedImage("owner", "image")).resolves.toBe("deleted");
    expect(mocks.imageFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "image", userId: "owner", kind: "TOOL_GENERATION" } }));
    expect(mocks.remove).toHaveBeenCalledWith("generated-images", "owner/image.png");
    expect(mocks.runDelete).toHaveBeenCalledWith({ where: { id: "run", userId: "owner", type: "IMAGE_GENERATE" } });
  });

  it("does not delete a missing or foreign image", async () => {
    mocks.imageFind.mockResolvedValue(null);
    await expect(deleteToolGeneratedImage("owner", "foreign")).resolves.toBe("not-found");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.runDelete).not.toHaveBeenCalled();
  });
});
