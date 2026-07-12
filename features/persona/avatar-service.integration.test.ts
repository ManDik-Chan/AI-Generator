import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  personaFind: vi.fn(), imageCreate: vi.fn(), imageFind: vi.fn(), imageDeleteMany: vi.fn(), transaction: vi.fn(),
  txPersonaFind: vi.fn(), txImageFind: vi.fn(), txPersonaUpdate: vi.fn(), generate: vi.fn(), download: vi.fn(),
  upload: vi.fn(), remove: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/database/prisma", () => ({ prisma: { persona: { findFirst: mocks.personaFind }, generatedImage: { create: mocks.imageCreate, findFirst: mocks.imageFind, deleteMany: mocks.imageDeleteMany }, $transaction: mocks.transaction } }));
vi.mock("@/lib/ai/image/registry", () => ({ getImageProvider: () => ({ generateImage: mocks.generate }) }));
vi.mock("@/lib/ai/image/config", () => ({ requireImageConfig: () => ({ size: "1280x1280" }) }));
vi.mock("@/lib/ai/image/download", () => ({ downloadRemoteImageSafely: mocks.download }));
vi.mock("@/features/persona/avatar-storage", () => ({ buildPersonaAvatarStoragePath: (userId: string, personaId: string, imageId: string, extension: string) => `${userId}/${personaId}/${imageId}.${extension}`, uploadPersonaAvatar: mocks.upload, removePersonaAvatar: mocks.remove }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { applyPersonaAvatar, deleteGeneratedAvatar, generatePersonaAvatarCandidate } from "@/features/persona/avatar-service";

const persona = { id: "p1", name: "小岚", avatarPrompt: "温和的插画头像", identity: null, personality: "温和", speakingStyle: null, expertise: null };

describe("persona avatar persistence orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.personaFind.mockResolvedValue(persona); mocks.generate.mockResolvedValue({ remoteUrl: "https://images.example/a.png", provider: "zhipu-glm-image", model: "glm-image", width: 1280, height: 1280 }); mocks.download.mockResolvedValue({ bytes: new Uint8Array([1]), mimeType: "image/png", extension: "png" }); mocks.imageCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation((callback) => callback({ persona: { findFirst: mocks.txPersonaFind, update: mocks.txPersonaUpdate }, generatedImage: { findFirst: mocks.txImageFind } }));
  });

  it("scopes generation lookup to the owner and allows archived personas", async () => { await generatePersonaAvatarCandidate("owner", "p1"); expect(mocks.personaFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", userId: "owner" } })); expect(mocks.personaFind.mock.calls[0][0].where).not.toHaveProperty("archivedAt"); });
  it("does not call the provider for another user's persona", async () => { mocks.personaFind.mockResolvedValue(null); await expect(generatePersonaAvatarCandidate("owner", "foreign")).resolves.toBeNull(); expect(mocks.generate).not.toHaveBeenCalled(); });
  it("stores an owner-scoped candidate without updating the persona", async () => { const candidate = await generatePersonaAvatarCandidate("owner", "p1"); expect(mocks.upload.mock.calls[0][0]).toMatch(/^owner\/p1\/.+\.png$/); expect(mocks.imageCreate.mock.calls[0][0].data).toMatchObject({ userId: "owner", provider: "zhipu-glm-image", model: "glm-image", width: 1280, height: 1280 }); expect(candidate?.previewUrl).toMatch(/^\/api\/generated-images\//); expect(mocks.txPersonaUpdate).not.toHaveBeenCalled(); });
  it("removes a just-uploaded object when GeneratedImage creation fails", async () => { mocks.imageCreate.mockRejectedValue(new Error("db")); await expect(generatePersonaAvatarCandidate("owner", "p1")).rejects.toMatchObject({ code: "STORAGE" }); expect(mocks.remove).toHaveBeenCalledTimes(1); });
  it("applies only an owned Persona and owned GeneratedImage", async () => { mocks.txPersonaFind.mockResolvedValue({ id: "p1", avatarImageId: null }); mocks.txImageFind.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440001" }); await expect(applyPersonaAvatar("owner", "p1", "550e8400-e29b-41d4-a716-446655440001", "温和头像")).resolves.toBe(true); expect(mocks.txPersonaFind.mock.calls[0][0].where).toEqual({ id: "p1", userId: "owner" }); expect(mocks.txImageFind.mock.calls[0][0].where).toEqual({ id: "550e8400-e29b-41d4-a716-446655440001", userId: "owner" }); expect(mocks.txPersonaUpdate.mock.calls[0][0].data).toMatchObject({ avatarImageId: "550e8400-e29b-41d4-a716-446655440001", avatarUrl: "/api/personas/p1/avatar?v=550e8400-e29b-41d4-a716-446655440001" }); });
  it("leaves the Persona unchanged when apply ownership validation fails", async () => { mocks.txPersonaFind.mockResolvedValue(null); mocks.txImageFind.mockResolvedValue({ id: "image" }); await expect(applyPersonaAvatar("owner", "p1", "550e8400-e29b-41d4-a716-446655440001", "温和头像")).resolves.toBeNull(); expect(mocks.txPersonaUpdate).not.toHaveBeenCalled(); });
  it("refuses to delete an image currently used by a Persona", async () => { mocks.imageFind.mockResolvedValue({ id: "image", storagePath: "owner/p/image.png", personaAvatar: { id: "p1" } }); await expect(deleteGeneratedAvatar("owner", "image")).resolves.toBe("in-use"); expect(mocks.remove).not.toHaveBeenCalled(); });
  it("deletes both storage and database for an unused owned candidate", async () => { mocks.imageFind.mockResolvedValue({ id: "image", storagePath: "owner/p/image.png", personaAvatar: null }); await expect(deleteGeneratedAvatar("owner", "image")).resolves.toBe("deleted"); expect(mocks.remove).toHaveBeenCalledWith("owner/p/image.png"); expect(mocks.imageDeleteMany).toHaveBeenCalledWith({ where: { id: "image", userId: "owner" } }); });
});
