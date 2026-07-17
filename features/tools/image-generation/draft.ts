import { z } from "zod";

import { IMAGE_GENERATION_PROMPT_MAX_CHARS } from "@/features/tools/image-generation/constants";
import { imageGenerationStyleSchema } from "@/features/tools/image-generation/schemas";

const draftSchema = z.object({
  input: z.string().trim().min(1).max(IMAGE_GENERATION_PROMPT_MAX_CHARS),
  options: z.object({ style: imageGenerationStyleSchema }).passthrough(),
}).passthrough();

export function parseImageGenerationDraft(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { prompt: parsed.data.input, style: parsed.data.options.style } : null;
  } catch {
    return null;
  }
}

export function consumeImageGenerationDraft(storage: Pick<Storage, "getItem" | "removeItem">) {
  const key = "ai-tool-draft:IMAGE_GENERATE";
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch { /* Storage may be disabled by browser privacy settings. */ }
  try {
    storage.removeItem(key);
  } catch { /* A failed cleanup must not break the workspace. */ }
  return parseImageGenerationDraft(raw);
}
