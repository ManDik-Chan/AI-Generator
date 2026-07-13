import type { z } from "zod";
import type { translateOptionsSchema } from "@/features/tools/schemas";
import { LANGUAGE_LABELS } from "@/features/tools/constants";
import { buildToolSystemPolicy, serializeUntrustedToolInput } from "@/lib/ai/prompts/tools/policy";

type Options = z.infer<typeof translateOptionsSchema>;
const tones = { original: "保持原语气", formal: "正式", natural: "自然", concise: "简洁" } as const;

export function buildTranslatePrompt(input: string, options: Options) {
  return {
    system: buildToolSystemPolicy({ tool: "TRANSLATE", trustedOptions: { 源语言: LANGUAGE_LABELS[options.sourceLanguage], 目标语言: LANGUAGE_LABELS[options.targetLanguage], 翻译语气: tones[options.tone], 保留Markdown: options.preserveMarkdown, 保留专有名词: options.preserveProperNouns, showOriginal: options.showOriginal } }),
    user: serializeUntrustedToolInput(input),
  };
}
