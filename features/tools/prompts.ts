import type { ToolRunInput } from "@/features/tools/schemas";
import { buildRewritePrompt } from "@/lib/ai/prompts/tools/rewrite";
import { buildSummarizePrompt } from "@/lib/ai/prompts/tools/summarize";
import { buildTranslatePrompt } from "@/lib/ai/prompts/tools/translate";

export function buildToolPrompt(input: ToolRunInput) {
  if (input.tool === "SUMMARIZE") return buildSummarizePrompt(input.input, input.options);
  if (input.tool === "REWRITE") return buildRewritePrompt(input.input, input.options);
  return buildTranslatePrompt(input.input, input.options);
}
