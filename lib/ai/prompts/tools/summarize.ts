import type { z } from "zod";
import type { summarizeOptionsSchema } from "@/features/tools/schemas";
import { buildToolSystemPolicy, serializeUntrustedToolInput } from "@/lib/ai/prompts/tools/policy";

type Options = z.infer<typeof summarizeOptionsSchema>;
const lengths = { short: "简短摘要", standard: "标准长度摘要", detailed: "详细笔记" } as const;
const formats = { paragraph: "段落摘要", bullets: "要点列表", "study-notes": "学习笔记：核心主题、关键概念、重要细节和简短结论" } as const;
const languages = { auto: "跟随原文", "zh-CN": "简体中文", en: "English" } as const;

export function buildSummarizePrompt(input: string, options: Options) {
  return {
    system: buildToolSystemPolicy({ tool: "SUMMARIZE", trustedOptions: { 摘要长度: lengths[options.length], 输出形式: formats[options.format], 输出语言: languages[options.language], 保留专业术语: true } }),
    user: serializeUntrustedToolInput(input),
  };
}
