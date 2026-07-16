import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), signed: vi.fn(), deleteTool: vi.fn(), deleteAvatar: vi.fn() }));
vi.mock("@/features/persona/avatar-api", () => ({ requireAvatarApiUser: mocks.auth }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { generatedImage: { findFirst: mocks.find } } }));
vi.mock("@/features/tools/image-generation/storage", () => ({ createGeneratedImageSignedUrl: mocks.signed }));
vi.mock("@/features/tools/image-generation/service", () => ({ deleteToolGeneratedImage: mocks.deleteTool }));
vi.mock("@/features/persona/avatar-service", () => ({ deleteGeneratedAvatar: mocks.deleteAvatar }));
vi.mock("@/lib/ai/image/config", () => ({ requireAvatarStorageConfig: () => ({ bucket: "persona-avatars" }), requireGeneratedImageStorageConfig: () => ({ bucket: "generated-images" }) }));

import { DELETE, GET } from "@/app/api/generated-images/[generatedImageId]/route";

const id = "550e8400-e29b-41d4-a716-446655440000";
const context = { params: Promise.resolve({ generatedImageId: id }) };
const request = new Request(`http://localhost/api/generated-images/${id}`);

describe("GeneratedImage authenticated Storage route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "owner" });
    mocks.signed.mockResolvedValue("https://signed.example/short-lived");
    mocks.deleteTool.mockResolvedValue("deleted");
  });

  it("does not sign or delete when the database bucket is forged", async () => {
    mocks.find.mockResolvedValue({ id, kind: "TOOL_GENERATION", storageBucket: "other-private-bucket", storagePath: "owner/image.png", mimeType: "image/png" });
    expect((await GET(request, context)).status).toBe(404);
    expect((await DELETE(request, context)).status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.deleteTool).not.toHaveBeenCalled();
  });

  it("does not sign or delete when the path belongs to another user", async () => {
    mocks.find.mockResolvedValue({ id, kind: "TOOL_GENERATION", storageBucket: "generated-images", storagePath: "other/image.png", mimeType: "image/png" });
    expect((await GET(request, context)).status).toBe(404);
    expect((await DELETE(request, context)).status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.deleteTool).not.toHaveBeenCalled();
  });

  it("passes only a trusted target to the signed URL service", async () => {
    mocks.find.mockResolvedValue({ id, kind: "TOOL_GENERATION", storageBucket: "generated-images", storagePath: "owner/image.png", mimeType: "image/png" });
    expect((await GET(request, context)).status).toBe(307);
    expect(mocks.signed).toHaveBeenCalledWith(expect.objectContaining({ bucket: "generated-images", path: "owner/image.png", kind: "TOOL_GENERATION" }), undefined);
  });

  it("uses the shared message field for deletion errors", async () => {
    mocks.auth.mockResolvedValue(null);
    const unauthorized = await DELETE(request, context);
    expect(await unauthorized.json()).toEqual({ message: "请先登录。" });
    mocks.auth.mockResolvedValue({ id: "owner" });
    mocks.find.mockResolvedValue(null);
    const missing = await DELETE(request, context);
    expect(await missing.json()).toEqual({ message: "图片不存在。" });
  });

  it("returns precise Chinese messages for in-use avatars and Storage failures", async () => {
    mocks.find.mockResolvedValue({ id, kind: "PERSONA_AVATAR", storageBucket: "persona-avatars", storagePath: "owner/persona/image.png", mimeType: "image/png" });
    mocks.deleteAvatar.mockResolvedValue("in-use");
    const inUse = await DELETE(request, context);
    expect(inUse.status).toBe(409);
    expect(await inUse.json()).toEqual({ message: "正在使用的头像不能删除。" });

    mocks.find.mockResolvedValue({ id, kind: "TOOL_GENERATION", storageBucket: "generated-images", storagePath: "owner/image.png", mimeType: "image/png" });
    mocks.deleteTool.mockRejectedValue(new Error("storage unavailable"));
    const failed = await DELETE(request, context);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ message: "图片删除失败，请稍后重试。" });
  });
});
