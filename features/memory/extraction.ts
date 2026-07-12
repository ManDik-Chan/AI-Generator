import { z } from "zod";
import { MEMORY_CATEGORIES } from "@/features/memory/constants";
import { memoryContentSchema } from "@/features/memory/schemas";
import { memoryTerms } from "@/features/memory/selection";

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

export function parseMemoryExtraction(output: string) {
  return memoryExtractionSchema.parse(JSON.parse(output.trim()));
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
