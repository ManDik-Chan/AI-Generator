import type { z } from "zod";
import type { rewriteOptionsSchema } from "@/features/tools/schemas";
import { buildToolSystemPolicy, serializeUntrustedToolInput } from "@/lib/ai/prompts/tools/policy";

type Options = z.infer<typeof rewriteOptionsSchema>;
const styles = { natural: "自然流畅", formal: "正式专业", concise: "简洁直接", friendly: "友好口语", academic: "学术清晰" } as const;
const intensities = { light: "轻度，仅修正语法和表达", standard: "标准，优化句式和结构", deep: "深度，可明显重组但保持原意" } as const;

export function buildRewritePrompt(input: string, options: Options) {
  return {
    system: buildToolSystemPolicy({ tool: "REWRITE", trustedOptions: { 改写风格: styles[options.style], 改写强度: intensities[options.intensity], 保留Markdown: options.preserveMarkdown, 尽量保持原长度: options.keepLength, explainChanges: options.explainChanges } }),
    user: serializeUntrustedToolInput(input),
  };
}
