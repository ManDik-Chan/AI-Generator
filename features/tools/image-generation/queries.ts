import {
  IMAGE_GENERATION_PAGE_SIZE,
  IMAGE_GENERATION_STYLES,
  type ImageGenerationStyle,
} from "@/features/tools/image-generation/constants";
import { imageGenerationHistoryOptionsSchema } from "@/features/tools/image-generation/schemas";
import type { GeneratedToolImageDto } from "@/features/tools/image-generation/types";
import { prisma } from "@/lib/database/prisma";

export async function getImageGenerationHistory(
  userId: string,
  page = 1,
) {
  const safePage = Math.max(1, Math.floor(page));
  const where = {
    userId,
    kind: "TOOL_GENERATION" as const,
    toolRun: { is: { type: "IMAGE_GENERATE" as const, status: "COMPLETE" as const } },
  };
  const [rows, total] = await Promise.all([
    prisma.generatedImage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * IMAGE_GENERATION_PAGE_SIZE,
      take: IMAGE_GENERATION_PAGE_SIZE,
      select: {
        id: true,
        prompt: true,
        width: true,
        height: true,
        createdAt: true,
        toolRun: { select: { options: true } },
      },
    }),
    prisma.generatedImage.count({ where }),
  ]);

  const images: GeneratedToolImageDto[] = rows.map((row) => {
    const parsed = imageGenerationHistoryOptionsSchema.safeParse(row.toolRun?.options);
    const style: ImageGenerationStyle = parsed.success
      ? parsed.data.style
      : "AUTO";
    return {
      id: row.id,
      previewUrl: `/api/generated-images/${row.id}`,
      downloadUrl: `/api/generated-images/${row.id}?download=1`,
      prompt: row.prompt,
      style: style in IMAGE_GENERATION_STYLES ? style : "AUTO",
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
    };
  });

  return {
    images,
    page: safePage,
    pages: Math.max(1, Math.ceil(total / IMAGE_GENERATION_PAGE_SIZE)),
    total,
  };
}
