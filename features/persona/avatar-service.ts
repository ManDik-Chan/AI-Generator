import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { resolvePersonaAvatarPrompt } from "@/features/persona/avatar-prompt";
import { buildPersonaAvatarStoragePath, removePersonaAvatar, uploadPersonaAvatar } from "@/features/persona/avatar-storage";
import { resolveGeneratedImageStorageTarget } from "@/features/generated-images/storage-target";
import { requireImageConfig } from "@/lib/ai/image/config";
import { downloadRemoteImageSafely } from "@/lib/ai/image/download";
import { ImageProviderError } from "@/lib/ai/image/errors";
import { getImageProvider } from "@/lib/ai/image/registry";
import { prisma } from "@/lib/database/prisma";

const FINAL_PROMPT_SUFFIX = "。单人头像，主体居中，适合作为正方形应用头像，不含文字、水印或标志。";

export function buildFinalAvatarPrompt(prompt: string) {
  const clean = prompt.trim();
  if (!clean || clean.length > 900) throw new ImageProviderError("INVALID_RESPONSE", "Avatar prompt must contain 1-900 characters");
  return `${clean}${FINAL_PROMPT_SUFFIX}`.slice(0, 1000);
}

export type PersonaAvatarGenerationStage = "preparing" | "generating" | "downloading" | "validating" | "uploading" | "saving";
export async function generatePersonaAvatarCandidate(userId: string, personaId: string, suppliedPrompt?: string, signal?: AbortSignal, onProgress?: (stage: PersonaAvatarGenerationStage) => void) {
  onProgress?.("preparing");
  const persona = await prisma.persona.findFirst({ where: { id: personaId, userId }, select: { id: true, name: true, avatarPrompt: true, identity: true, personality: true, speakingStyle: true, expertise: true } });
  if (!persona) return null;
  const prompt = resolvePersonaAvatarPrompt({ name: persona.name, personality: persona.personality, identity: persona.identity ?? undefined, speakingStyle: persona.speakingStyle ?? undefined, expertise: persona.expertise ?? undefined, avatarPrompt: suppliedPrompt ?? persona.avatarPrompt ?? undefined });
  const finalPrompt = buildFinalAvatarPrompt(prompt);
  const config = requireImageConfig();
  onProgress?.("generating");
  const result = await getImageProvider().generateImage({ prompt: finalPrompt, size: config.size, signal });
  onProgress?.("downloading");
  const downloaded = await downloadRemoteImageSafely(result.remoteUrl, { signal, onProgress: () => onProgress?.("validating") });
  const generatedImageId = randomUUID();
  const storagePath = buildPersonaAvatarStoragePath(userId, personaId, generatedImageId, downloaded.extension);
  onProgress?.("uploading");
  const storageTarget = await uploadPersonaAvatar(userId, storagePath, downloaded.bytes, downloaded.mimeType);
  try {
    onProgress?.("saving");
    await prisma.generatedImage.create({ data: { id: generatedImageId, userId, kind: "PERSONA_AVATAR", prompt, provider: result.provider, model: result.model, storagePath: storageTarget.path, storageBucket: storageTarget.bucket, mimeType: downloaded.mimeType, sizeBytes: downloaded.bytes.byteLength, width: result.width, height: result.height } });
  } catch {
    try { await removePersonaAvatar(storageTarget); } catch { /* best-effort rollback */ }
    throw new ImageProviderError("STORAGE", "Generated image record could not be saved");
  }
  return { generatedImageId, previewUrl: `/api/generated-images/${generatedImageId}`, prompt, width: result.width, height: result.height };
}

export async function applyPersonaAvatar(userId: string, personaId: string, generatedImageId: string, prompt: string) {
  buildFinalAvatarPrompt(prompt);
  const cleanPrompt = prompt.trim();
  const result = await prisma.$transaction(async (tx) => {
    const persona = await tx.persona.findFirst({ where: { id: personaId, userId }, select: { id: true, avatarImageId: true } });
    const image = await tx.generatedImage.findFirst({ where: { id: generatedImageId, userId, kind: "PERSONA_AVATAR" }, select: { id: true } });
    if (!persona || !image) return null;
    await tx.persona.update({ where: { id: persona.id }, data: { avatarPrompt: cleanPrompt, avatarImageId: image.id, avatarUrl: `/api/personas/${persona.id}/avatar?v=${image.id}` } });
    return { oldImageId: persona.avatarImageId };
  });
  if (!result) return null;
  revalidatePersonaAvatar(personaId);
  if (result.oldImageId && result.oldImageId !== generatedImageId) await cleanupUnusedGeneratedImage(userId, result.oldImageId);
  return { avatarUrl: `/api/personas/${personaId}/avatar?v=${generatedImageId}`, avatarImageId: generatedImageId };
}

export async function deleteGeneratedAvatar(userId: string, generatedImageId: string) {
  const image = await prisma.generatedImage.findFirst({ where: { id: generatedImageId, userId, kind: "PERSONA_AVATAR" }, select: { id: true, kind: true, storageBucket: true, storagePath: true, personaAvatar: { select: { id: true } } } });
  if (!image) return "not-found" as const;
  if (image.personaAvatar) return "in-use" as const;
  const target = resolveGeneratedImageStorageTarget({ userId, kind: image.kind, storedBucket: image.storageBucket, storedPath: image.storagePath });
  if (!target) return "not-found" as const;
  await removePersonaAvatar(target);
  await prisma.generatedImage.deleteMany({ where: { id: image.id, userId } });
  return "deleted" as const;
}

export async function cleanupUnusedGeneratedImage(userId: string, generatedImageId: string) {
  try { await deleteGeneratedAvatar(userId, generatedImageId); } catch (error) { console.warn("Persona avatar cleanup failed", error instanceof Error ? error.name : "unknown"); }
}

export function revalidatePersonaAvatar(personaId: string) {
  revalidatePath("/personas"); revalidatePath(`/personas/${personaId}`); revalidatePath(`/personas/${personaId}/edit`); revalidatePath("/chat", "layout");
}
