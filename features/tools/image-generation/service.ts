import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { type ImageGenerationStyle } from "@/features/tools/image-generation/constants";
import { buildToolImagePrompt } from "@/features/tools/image-generation/prompt";
import {
  buildGeneratedImageStoragePath,
  removeGeneratedImageObject,
  uploadGeneratedImage,
} from "@/features/tools/image-generation/storage";
import type { GeneratedToolImageDto } from "@/features/tools/image-generation/types";
import { requireImageConfig } from "@/lib/ai/image/config";
import { downloadRemoteImageSafely } from "@/lib/ai/image/download";
import { ImageProviderError } from "@/lib/ai/image/errors";
import { getImageProvider } from "@/lib/ai/image/registry";
import { prisma } from "@/lib/database/prisma";

export type ToolImageGenerationStage =
  | "preparing"
  | "generating"
  | "downloading"
  | "validating"
  | "uploading"
  | "saving";

export interface GenerateToolImageInput {
  userId: string;
  runId: string;
  prompt: string;
  style: ImageGenerationStyle;
  signal?: AbortSignal;
  onProgress?(stage: ToolImageGenerationStage): void;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ImageProviderError("ABORTED", "Image generation was cancelled");
  }
}

export async function generateToolImage(
  input: GenerateToolImageInput,
): Promise<GeneratedToolImageDto> {
  input.onProgress?.("preparing");
  const finalPrompt = buildToolImagePrompt(input.prompt, input.style);
  const config = requireImageConfig();
  assertNotAborted(input.signal);

  input.onProgress?.("generating");
  const providerResult = await getImageProvider().generateImage({
    prompt: finalPrompt,
    size: config.size,
    signal: input.signal,
  });
  assertNotAborted(input.signal);

  input.onProgress?.("downloading");
  const downloaded = await downloadRemoteImageSafely(providerResult.remoteUrl, {
    signal: input.signal,
    onProgress: () => input.onProgress?.("validating"),
  });
  assertNotAborted(input.signal);

  const generatedImageId = randomUUID();
  const storagePath = buildGeneratedImageStoragePath(
    input.userId,
    generatedImageId,
    downloaded.extension,
  );
  input.onProgress?.("uploading");
  const storageBucket = await uploadGeneratedImage(
    storagePath,
    downloaded.bytes,
    downloaded.mimeType,
  );

  try {
    assertNotAborted(input.signal);
    input.onProgress?.("saving");
    const created = await prisma.$transaction(async (transaction) => {
      const pending = await transaction.toolRun.findFirst({
        where: {
          id: input.runId,
          userId: input.userId,
          type: "IMAGE_GENERATE",
          status: "PENDING",
        },
        select: { id: true },
      });
      if (!pending) {
        throw new ImageProviderError("ABORTED", "Image generation is no longer pending");
      }
      const image = await transaction.generatedImage.create({
        data: {
          id: generatedImageId,
          userId: input.userId,
          kind: "TOOL_GENERATION",
          prompt: input.prompt.trim(),
          provider: providerResult.provider,
          model: providerResult.model,
          storagePath,
          storageBucket,
          mimeType: downloaded.mimeType,
          sizeBytes: downloaded.bytes.byteLength,
          width: providerResult.width,
          height: providerResult.height,
          toolRunId: input.runId,
        },
        select: { id: true, prompt: true, width: true, height: true, createdAt: true },
      });
      const completed = await transaction.toolRun.updateMany({
        where: {
          id: input.runId,
          userId: input.userId,
          type: "IMAGE_GENERATE",
          status: "PENDING",
        },
        data: { status: "COMPLETE" },
      });
      if (!completed.count) {
        throw new ImageProviderError("ABORTED", "Image generation was cancelled before saving");
      }
      return image;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      id: created.id,
      previewUrl: `/api/generated-images/${created.id}`,
      downloadUrl: `/api/generated-images/${created.id}?download=1`,
      prompt: created.prompt,
      style: input.style,
      width: created.width,
      height: created.height,
      createdAt: created.createdAt.toISOString(),
    };
  } catch (error) {
    await removeGeneratedImageObject(storageBucket, storagePath).catch(() =>
      console.error("generated_image_compensation_failed", {
        userId: input.userId,
        runId: input.runId,
        stage: "saving",
      }),
    );
    if (error instanceof ImageProviderError) throw error;
    throw new ImageProviderError("STORAGE", "Generated image record could not be saved");
  }
}

export async function deleteToolGeneratedImage(
  userId: string,
  generatedImageId: string,
) {
  const image = await prisma.generatedImage.findFirst({
    where: { id: generatedImageId, userId, kind: "TOOL_GENERATION" },
    select: {
      id: true,
      storageBucket: true,
      storagePath: true,
      toolRunId: true,
    },
  });
  if (!image?.toolRunId) return "not-found" as const;
  await removeGeneratedImageObject(image.storageBucket, image.storagePath);
  const deleted = await prisma.toolRun.deleteMany({
    where: {
      id: image.toolRunId,
      userId,
      type: "IMAGE_GENERATE",
    },
  });
  return deleted.count ? "deleted" as const : "not-found" as const;
}

export async function cleanupToolGeneratedImageForRun(
  userId: string,
  runId: string,
) {
  const image = await prisma.generatedImage.findFirst({
    where: {
      userId,
      toolRunId: runId,
      kind: "TOOL_GENERATION",
    },
    select: { storageBucket: true, storagePath: true },
  });
  if (!image) return;
  await removeGeneratedImageObject(image.storageBucket, image.storagePath);
}
