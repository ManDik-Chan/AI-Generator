import type { MemoryInput } from "@/features/memory/schemas";
export interface MemoryView { id: string; content: string; category: string; scope: "GLOBAL" | "PERSONA"; origin: "MANUAL" | "CHAT_MESSAGE" | "AUTO_EXTRACTED"; importance: number; enabled: boolean; pinned: boolean; useCount: number; topicKey?: string; keywords: string[]; personaId?: string; personaName?: string; sourceConversationId?: string; sourceConversationTitle?: string; lastUsedAt?: string; createdAt: string; updatedAt: string }
export type MemoryActionResult = { success: true; id?: string; message: string } | { success: false; message: string; fieldErrors?: Record<string, string[]> };
export type { MemoryInput };
