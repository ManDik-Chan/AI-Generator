import type { MemoryInput } from "@/features/memory/schemas";
import type { MemoryVerificationMethod } from "@prisma/client";
export interface MemoryView { id: string; content: string; category: string; scope: "GLOBAL" | "PERSONA"; origin: "MANUAL" | "CHAT_MESSAGE" | "AUTO_EXTRACTED"; verificationMethod: MemoryVerificationMethod; verifiedAt?: string; importance: number; enabled: boolean; pinned: boolean; useCount: number; topicKey?: string; keywords: string[]; personaId?: string; personaName?: string; sourceConversationId?: string; sourceConversationTitle?: string; lastUsedAt?: string; createdAt: string; updatedAt: string }
export interface MemoryProposalView {
  id: string;
  actionLabel: "建议新增" | "建议更新";
  content: string;
  category: string;
  scope: "GLOBAL" | "PERSONA";
  importance: number;
  topicKey?: string;
  keywords: string[];
  confidenceLabel: string;
  personaId?: string;
  personaName?: string;
  sourceConversationId?: string;
  sourceConversationTitle?: string;
  currentTargetContent?: string;
  canAccept: boolean;
  conflictState:
    | "NONE"
    | "TARGET_CHANGED"
    | "TARGET_MISSING"
    | "TOPIC_CONFLICT"
    | "DISABLED_DUPLICATE";
  createdAt: string;
  expiresAt: string;
}
export type MemoryActionResult = {
  success: boolean;
  id?: string;
  message: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  stateChanged?: boolean;
  idempotent?: boolean;
  verificationMethod?: MemoryVerificationMethod;
  verifiedAt?: string;
  finalStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  resolutionSnapshot?: {
    memories: MemoryView[];
    proposals: MemoryProposalView[];
  };
};
export type { MemoryInput };
