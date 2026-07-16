import { z } from "zod";

import { TOOL_INPUT_MAX_CHARS } from "@/features/tools/constants";

const input = z.string().trim().min(1, "请输入需要处理的文本。").max(TOOL_INPUT_MAX_CHARS, `输入不能超过 ${TOOL_INPUT_MAX_CHARS} 个字符。`);
const base = { input, saveHistory: z.boolean().default(true) };

export const summarizeOptionsSchema = z.object({
  length: z.enum(["short", "standard", "detailed"]),
  format: z.enum(["paragraph", "bullets", "study-notes"]),
  language: z.enum(["auto", "zh-CN", "en"]),
}).strict();

export const rewriteOptionsSchema = z.object({
  style: z.enum(["natural", "formal", "concise", "friendly", "academic"]),
  intensity: z.enum(["light", "standard", "deep"]),
  preserveMarkdown: z.boolean(),
  keepLength: z.boolean(),
  explainChanges: z.boolean(),
}).strict();

export const translateOptionsSchema = z.object({
  sourceLanguage: z.enum(["auto", "zh-CN", "en", "ja", "ko", "fr", "de", "es"]),
  targetLanguage: z.enum(["zh-CN", "en", "ja", "ko", "fr", "de", "es"]),
  tone: z.enum(["original", "formal", "natural", "concise"]),
  preserveMarkdown: z.boolean(),
  preserveProperNouns: z.boolean(),
  showOriginal: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.sourceLanguage !== "auto" && value.sourceLanguage === value.targetLanguage) {
    context.addIssue({ code: "custom", path: ["targetLanguage"], message: "源语言和目标语言不能相同。" });
  }
});

export const toolRunRequestSchema = z.discriminatedUnion("tool", [
  z.object({ ...base, tool: z.literal("SUMMARIZE"), options: summarizeOptionsSchema }).strict(),
  z.object({ ...base, tool: z.literal("REWRITE"), options: rewriteOptionsSchema }).strict(),
  z.object({ ...base, tool: z.literal("TRANSLATE"), options: translateOptionsSchema }).strict(),
]);

export const toolRunIdSchema = z.string().uuid();
export const toolHistoryFilterSchema = z.enum(["ALL", "SUMMARIZE", "REWRITE", "TRANSLATE", "IMAGE_ANALYZE", "IMAGE_GENERATE"]);
export type ToolRunInput = z.infer<typeof toolRunRequestSchema>;
