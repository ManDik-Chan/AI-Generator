import { z } from "zod";

import {
  IMAGE_GENERATION_PROMPT_MAX_CHARS,
  IMAGE_GENERATION_STYLES,
} from "@/features/tools/image-generation/constants";

export const imageGenerationStyleSchema = z.enum(
  Object.keys(IMAGE_GENERATION_STYLES) as [
    keyof typeof IMAGE_GENERATION_STYLES,
    ...(keyof typeof IMAGE_GENERATION_STYLES)[],
  ],
);

export const imageGenerationRequestSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, "请输入图片描述。")
      .max(
        IMAGE_GENERATION_PROMPT_MAX_CHARS,
        `图片描述不能超过 ${IMAGE_GENERATION_PROMPT_MAX_CHARS} 个字符。`,
      ),
    style: imageGenerationStyleSchema,
  })
  .strict();

export const imageGenerationHistoryOptionsSchema = z
  .object({
    style: imageGenerationStyleSchema,
    size: z.string().regex(/^\d+x\d+$/),
  })
  .strict();

export type ImageGenerationRequest = z.infer<
  typeof imageGenerationRequestSchema
>;
