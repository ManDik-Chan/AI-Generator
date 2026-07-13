import { z } from "zod";
import { MEMORY_CATEGORIES } from "@/features/memory/constants";
import { memoryContentSchema } from "@/features/memory/schemas";
import { memoryTerms } from "@/features/memory/selection";
import { extractFirstJsonObject } from "@/features/persona/generation";

export const MEMORY_EXTRACTION_CONFIDENCE = 0.85;
export const MEMORY_EXTRACTION_MAX_OPERATIONS = 3;

const reasonCodeSchema = z.enum([
  "stable_fact", "preference", "long_term_goal", "project", "constraint",
  "relationship", "temporary", "uncertain", "sensitive",
]);

const operationSchema = z.object({
  action: z.enum(["CREATE", "UPDATE", "IGNORE"]),
  existingMemoryId: z.uuid().optional(),
  content: memoryContentSchema.optional(),
  category: z.enum(MEMORY_CATEGORIES).optional(),
  scope: z.enum(["GLOBAL", "PERSONA"]).optional(),
  importance: z.coerce.number().int().min(1).max(5).optional(),
  confidence: z.number().min(0).max(1),
  reasonCode: reasonCodeSchema,
}).strip().superRefine((value, context) => {
  if (value.action !== "IGNORE" && (!value.content || !value.category || !value.scope || !value.importance)) {
    context.addIssue({ code: "custom", message: "CREATE/UPDATE 缺少必要字段。" });
  }
  if (value.action === "UPDATE" && !value.existingMemoryId) {
    context.addIssue({ code: "custom", path: ["existingMemoryId"], message: "UPDATE 缺少候选记忆 ID。" });
  }
  if (value.action === "CREATE" && value.existingMemoryId) {
    context.addIssue({ code: "custom", path: ["existingMemoryId"], message: "CREATE 不应提供记忆 ID。" });
  }
});

export const memoryExtractionSchema = z.object({
  operations: z.array(operationSchema).max(MEMORY_EXTRACTION_MAX_OPERATIONS),
}).strip();

export type MemoryExtractionOperation = z.infer<typeof operationSchema>;

export function parseMemoryExtractionOutput(output: string) {
  const trimmed = output.trim();
  try {
    return memoryExtractionSchema.parse(JSON.parse(trimmed));
  } catch (directError) {
    try {
      return memoryExtractionSchema.parse(JSON.parse(extractFirstJsonObject(trimmed)));
    } catch {
      throw directError;
    }
  }
}

export type ExplicitMemoryIntent = "INLINE_FACT" | "PREVIOUS_CONTEXT";

export function detectExplicitMemoryIntent(message: string): ExplicitMemoryIntent | undefined {
  const text = message.trim();
  if (!/(?:请|帮我|需要你)?记住|以后记得|把(?:这个|这些|它)?记下来|别忘了/u.test(text)) return undefined;
  const withoutIntent = text
    .replace(/(?:请|帮我|需要你)?记住(?:一下)?/gu, " ")
    .replace(/以后记得/gu, " ")
    .replace(/把(?:这个|这些|它)?记下来/gu, " ")
    .replace(/别忘了/gu, " ")
    .replace(/[，。！？,.!?]/g, " ")
    .trim();
  const explicitCarry = /(?:以后记得|别忘了)/u.test(text) && withoutIntent.length > 1 && !/^(?:这个|这些|它|我的?(?:电脑)?配置)$/u.test(withoutIntent);
  const hasInlineFact = explicitCarry || /(?:是|为|叫|喜欢|偏好|换成|改成|使用|不要|总是|一直|以后|不吃|不喝|不使用).{1,}|(?:RTX|GTX|Core|Ryzen|\bi[3579]-?\d|\d+[KkPp]?(?:Hz|GB|TB|K)\b)/iu.test(withoutIntent);
  return hasInlineFact ? "INLINE_FACT" : "PREVIOUS_CONTEXT";
}

export function shouldRunMemoryExtraction(message: string) {
  const normalized = message.trim().replace(/[\p{P}\p{S}\s]+/gu, "").toLocaleLowerCase("zh-CN");
  if (!normalized) return false;
  if (["你好", "您好", "谢谢", "谢谢你", "好的", "好", "继续", "明白了", "收到", "可以"].includes(normalized)) return false;
  if (normalized.length >= 4) return true;
  return /(?:我叫|我爱|我怕|喜欢|偏好|以后|不要)/u.test(normalized);
}

export interface ExtractionCandidate {
  id: string;
  content: string;
  category: string;
  scope: "GLOBAL" | "PERSONA";
  importance: number;
  updatedAt: Date | string;
}

export function selectExtractionCandidates(message: string, candidates: ExtractionCandidate[]) {
  const currentTerms = memoryTerms(message);
  return candidates
    .map((memory) => {
      let overlap = 0;
      for (const term of memoryTerms(memory.content)) if (currentTerms.has(term)) overlap += 1;
      return { memory, overlap };
    })
    .sort((a, b) =>
      b.overlap - a.overlap ||
      b.memory.importance - a.memory.importance ||
      new Date(b.memory.updatedAt).getTime() - new Date(a.memory.updatedAt).getTime() ||
      a.memory.id.localeCompare(b.memory.id))
    .slice(0, 20)
    .map(({ memory }) => memory);
}

export function hasTraceableUserEvidence(content: string, sourceMessages: string[]) {
  if (!sourceMessages.length) return false;
  const contentTerms = memoryTerms(content);
  const sourceTerms = memoryTerms(sourceMessages.join("\n"));
  let overlap = 0;
  for (const term of contentTerms) {
    if (!sourceTerms.has(term)) continue;
    if (/^[a-z0-9]+$/i.test(term) && term.length >= 2) return true;
    overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}
