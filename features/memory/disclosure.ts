import { z } from "zod";
import type { MemoryVerificationMethod } from "@prisma/client";

import { MEMORY_LIMITS } from "@/features/memory/constants";

const verificationMethodSchema = z.enum([
  "MANUAL_ENTRY",
  "EXPLICIT_REQUEST",
  "PROPOSAL_ACCEPTANCE",
  "MANUAL_REVIEW",
  "LEGACY_UNREVIEWED",
]);

export const chatMemoryDisclosureItemSchema = z.object({
  id: z.uuid(),
  content: z.string().min(2).max(MEMORY_LIMITS.content),
  category: z.string().trim().min(1).max(80),
  scope: z.enum(["GLOBAL", "PERSONA"]),
  verificationMethod: verificationMethodSchema,
}).strict();

export const chatMemoryDisclosureSchema = z.object({
  version: z.literal(1),
  count: z.number().int().min(0).max(MEMORY_LIMITS.maxItems),
  items: z.array(chatMemoryDisclosureItemSchema).max(MEMORY_LIMITS.maxItems),
}).strict().superRefine((value, context) => {
  if (value.count !== value.items.length) {
    context.addIssue({
      code: "custom",
      path: ["count"],
      message: "Memory disclosure count must match its items.",
    });
  }
  if (
    value.items.reduce((total, item) => total + item.content.length, 0)
    > MEMORY_LIMITS.maxChars
  ) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "Memory disclosure exceeds the recall character budget.",
    });
  }
});

export type ChatMemoryDisclosure = z.infer<typeof chatMemoryDisclosureSchema>;

interface SelectedMemoryForDisclosure {
  id: string;
  content: string;
  category: string;
  scope: "GLOBAL" | "PERSONA";
  verificationMethod: MemoryVerificationMethod;
}

export function createChatMemoryDisclosure(
  selectedMemories: readonly SelectedMemoryForDisclosure[],
): ChatMemoryDisclosure {
  return chatMemoryDisclosureSchema.parse({
    version: 1,
    count: selectedMemories.length,
    items: selectedMemories.map((memory) => ({
      id: memory.id,
      content: memory.content,
      category: memory.category,
      scope: memory.scope,
      verificationMethod: memory.verificationMethod,
    })),
  });
}
