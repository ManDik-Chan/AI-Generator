import { z } from "zod";
import { MEMORY_CATEGORIES } from "@/features/memory/constants";
import { memoryContentSchema, memoryKeywordsSchema, memoryTopicKeySchema } from "@/features/memory/schemas";
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
  topicKey: memoryTopicKeySchema,
  keywords: memoryKeywordsSchema.default([]),
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
  if (value.action === "CREATE" && !value.topicKey) context.addIssue({ code: "custom", path: ["topicKey"], message: "CREATE 缺少主题。" });
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
  const text = message
    .normalize("NFKC")
    .trim()
    .replace(/^(?:ChatGPT|助手|AI)[,，:：\s]+/iu, "");
  if (!text) return undefined;
  const trailingCommand = /(?:[,，;；。]\s*)(?:(?:请|请你|麻烦你?|帮我)\s*)?记(?:住|下|下来)(?:一下)?[!！。.\s]*$/u;

  // Questions, negated requests, self-reports and quotations are deliberately
  // fail-closed: they can still be proposed, but never become formal memory
  // without confirmation.
  if (/[?？]\s*$/u.test(text) || /(?:吗|么|呢)[!！。.\s]*$/u.test(text)) return undefined;
  if (/(?:不用|不要|不必|别)(?:你|再)?(?:帮我)?记(?:住|下|下来|得)/u.test(text)) {
    return undefined;
  }
  if (
    !trailingCommand.test(text)
    && /^(?:我|这篇文章|这本书|这门课|这个故事).{0,18}(?:终于|已经|总算|让我|使我|要我|也)?记(?:住|得|下来|不住)/u.test(text)
  ) {
    return undefined;
  }
  if (/(?:他说|她说|他们说|别人说|文章里|原文|引用).{0,20}(?:记住|记得|别忘|记下来)/u.test(text)) {
    return undefined;
  }
  if (/[“"'「『].{0,40}(?:记住|记得|别忘|记下来).{0,40}[”"'」』]/u.test(text)) {
    return undefined;
  }

  const directRemember = /^(?:请|请你|麻烦你?|劳驾|拜托|帮我|需要你|你要|你得|务必|一定要)\s*记(?:住|下|下来)(?:一下)?[,，:：\s]*/u;
  const directObject = /^(?:(?:请|请你|麻烦你?|劳驾|拜托|帮我|需要你|你要|你得|务必|一定要)\s*)?把.{1,120}?记(?:住|下|下来)(?:[,，:：。.!！\s]|$)/u;
  const futureReminder = /^(?:以后|从今以后)?\s*(?:(?:请|请你|麻烦你?|帮我|需要你|你要|你得|务必|一定要)\s*)?(?:记得|别忘了?)[,，:：\s]*/u;
  const command = text.match(directRemember)
    ?? text.match(directObject)
    ?? text.match(futureReminder)
    ?? text.match(trailingCommand);
  if (!command) return undefined;

  const payload = text
    .replace(directRemember, " ")
    .replace(futureReminder, " ")
    .replace(trailingCommand, " ")
    .replace(/^(?:(?:请|请你|麻烦你?|帮我)\s*)?把/u, " ")
    .replace(/记(?:住|下|下来)(?:一下)?[!！。.\s]*$/u, " ")
    .replace(/[，。！？,.!?:：;；]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!payload || /^(?:这个|这些|它|这件事|上面这些|刚才说的|我刚才说的)$/u.test(payload)) {
    return "PREVIOUS_CONTEXT";
  }

  const hasInlineFact =
    /(?:是|为|叫|喜欢|偏好|换成|改成|使用|总是|一直|以后|不吃|不喝|不使用|需要|目标|配置).{1,}/u.test(payload)
    || /(?:RTX|GTX|Core|Ryzen|\bi[3579]-?\d|\d+[KkPp]?(?:Hz|GB|TB|K)\b)/iu.test(payload)
    || directObject.test(text)
    || futureReminder.test(text);
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
  revision: number;
  topicKey?: string | null;
  keywords?: string[];
  pinned?: boolean;
  useCount?: number;
  lastUsedAt?: Date | string | null;
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
