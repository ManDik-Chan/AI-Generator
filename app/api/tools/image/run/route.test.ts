import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), createRun: vi.fn(), finishRecoverable: vi.fn(), finishRun: vi.fn(), persistPartial: vi.fn(), isPending: vi.fn(),
  streamImageAnalysis: vi.fn(), processImage: vi.fn(), uploadAsset: vi.fn(), assetCreate: vi.fn(), cleanupAssets: vi.fn(),
}));
vi.mock("@/lib/auth/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { toolAsset: { create: mocks.assetCreate, findFirst: vi.fn() } } }));
vi.mock("@/features/tools/usage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/tools/usage")>()), createPendingVisionToolRun: mocks.createRun, finishRecoverableToolRun: mocks.finishRecoverable, finishToolRun: mocks.finishRun, persistToolRunPartial: mocks.persistPartial, isToolRunPending: mocks.isPending }));
vi.mock("@/features/tools/image/processor", () => ({ processUploadedImage: mocks.processImage, UnsafeUploadError: class UnsafeUploadError extends Error { code = "UNSAFE_IMAGE"; } }));
vi.mock("@/features/tools/image/storage", () => ({ buildToolAssetPath: (userId: string, runId: string, extension: string) => `${userId}/${runId}/550e8400-e29b-41d4-a716-446655440002.${extension}`, downloadToolAsset: vi.fn(), removeToolAssets: vi.fn(), uploadToolAsset: mocks.uploadAsset }));
vi.mock("@/features/tools/image/assets", () => ({ cleanupToolRunAssets: mocks.cleanupAssets }));
vi.mock("@/features/storage/deletion", () => ({ requestDeletion: vi.fn(), performDeletion: vi.fn() }));
vi.mock("@/features/storage/owned-target", () => ({ authorizedToolAssetBucket: vi.fn(), validateObjectIdentity: vi.fn() }));
vi.mock("@/lib/ai/vision/config", () => ({ getToolAssetConfig: () => ({ bucket: "tool-assets", retentionDays: 7 }) }));
vi.mock("@/lib/ai/vision/registry", () => ({ getVisionProvider: () => ({ config: { dailyLimit: 10 }, provider: { streamImageAnalysis: mocks.streamImageAnalysis } }) }));

import { POST } from "@/app/api/tools/image/run/route";
import { AiProviderError } from "@/lib/ai/errors";

const USER = "550e8400-e29b-41d4-a716-446655440000";
const RUN = "550e8400-e29b-41d4-a716-446655440001";

function request(saveHistory = true) {
  const form = new FormData();
  form.set("image", new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
  form.set("saveHistory", String(saveHistory));
  form.set("options", JSON.stringify({ mode: "general", detail: "standard", language: "auto" }));
  return new Request("http://localhost/api/tools/image/run", { method: "POST", body: form });
}

describe("image analysis run API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER } } });
    mocks.processImage.mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: "image/png", extension: "png", sizeBytes: 1, width: 1, height: 1, sha256: "hash" });
    mocks.createRun.mockResolvedValue({ runId: RUN, limit: 10, used: 1, remaining: 9, unlimited: false });
    mocks.finishRecoverable.mockResolvedValue({ count: 1 });
    mocks.persistPartial.mockResolvedValue({ count: 1 });
    mocks.isPending.mockResolvedValue(true);
    mocks.cleanupAssets.mockResolvedValue(undefined);
    mocks.streamImageAnalysis.mockImplementation(async function* () { yield "图片里是"; yield "一只猫"; });
  });

  it("streams the analysis and stores the complete output", async () => {
    const response = await POST(request());
    const text = await response.text();
    expect(text).toContain("event: start");
    expect(text).toContain("图片里是一只猫");
    expect(text).toContain("event: done");
    expect(mocks.finishRecoverable).toHaveBeenCalledWith(USER, RUN, "COMPLETE", { outputText: "图片里是一只猫" });
  });

  it("stores only released text in a partial save and never the output the guard blocks", async () => {
    const filler = "a".repeat(1000);
    mocks.streamImageAnalysis.mockImplementation(async function* () { yield `${filler}\nAuthorization: Bearer abc`; yield "defgh12345"; });
    const response = await POST(request());
    const text = await response.text();
    expect(text).toContain('"code":"UNSAFE_OUTPUT"');
    expect(text).not.toContain("Bearer");
    // The first chunk passes the guard, so the partial save runs before the block.
    expect(mocks.persistPartial).toHaveBeenCalledTimes(1);
    const [, , partial] = mocks.persistPartial.mock.calls[0] as [string, string, string];
    expect(partial).toBe("a".repeat(770));
    expect(mocks.finishRecoverable).toHaveBeenCalledWith(USER, RUN, "ERROR", { errorCode: "UNSAFE_OUTPUT" });
    expect(JSON.stringify([mocks.persistPartial.mock.calls, mocks.finishRecoverable.mock.calls])).not.toContain("Authorization");
  });

  it("removes the source image of a no-history run at completion and on failure", async () => {
    await (await POST(request(false))).text();
    expect(mocks.cleanupAssets).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupAssets).toHaveBeenCalledWith(USER, RUN);
    mocks.cleanupAssets.mockClear();
    mocks.streamImageAnalysis.mockImplementation(async function* () { yield "部分结果"; throw new AiProviderError("TIMEOUT", "Vision request timed out."); });
    await (await POST(request(false))).text();
    expect(mocks.cleanupAssets).toHaveBeenCalledTimes(1);
  });

  it("removes the source image of a no-history run cancelled before the stream starts", async () => {
    mocks.isPending.mockResolvedValue(false);
    const text = await (await POST(request(false))).text();
    expect(text).toContain("event: cancelled");
    expect(mocks.streamImageAnalysis).not.toHaveBeenCalled();
    expect(mocks.cleanupAssets).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupAssets).toHaveBeenCalledWith(USER, RUN);
  });

  it("removes the source image of a no-history run when a partial save finds it cancelled", async () => {
    mocks.persistPartial.mockResolvedValue({ count: 0 });
    mocks.streamImageAnalysis.mockImplementation(async function* () { yield "a".repeat(1100); yield "更多内容"; });
    const text = await (await POST(request(false))).text();
    expect(text).toContain("event: cancelled");
    expect(text).not.toContain("更多内容");
    expect(mocks.cleanupAssets).toHaveBeenCalledTimes(1);
    expect(mocks.finishRecoverable).not.toHaveBeenCalled();
  });

  it("keeps the source image of a cancelled run when history is on", async () => {
    mocks.isPending.mockResolvedValue(false);
    const text = await (await POST(request(true))).text();
    expect(text).toContain("event: cancelled");
    expect(mocks.cleanupAssets).not.toHaveBeenCalled();
  });

  it("still reports completion when the source image removal fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.cleanupAssets.mockRejectedValue(new Error("ASSET_CLEANUP_PENDING"));
    const text = await (await POST(request(false))).text();
    expect(text).toContain("event: done");
    expect(mocks.finishRecoverable).toHaveBeenCalledTimes(1);
    expect(mocks.finishRecoverable).toHaveBeenCalledWith(USER, RUN, "COMPLETE", { outputText: "图片里是一只猫" });
    expect(log).toHaveBeenCalledWith("tool_asset_cleanup_pending", { userId: USER, runId: RUN });
    log.mockRestore();
  });

  it("keeps the partial output of a provider failure", async () => {
    mocks.streamImageAnalysis.mockImplementation(async function* () { yield "部分结果"; throw new AiProviderError("TIMEOUT", "Vision request timed out."); });
    const response = await POST(request());
    const text = await response.text();
    expect(text).toContain('"code":"TIMEOUT"');
    expect(mocks.finishRecoverable).toHaveBeenCalledWith(USER, RUN, "ERROR", { outputText: "部分结果", errorCode: "TIMEOUT" });
  });
});
