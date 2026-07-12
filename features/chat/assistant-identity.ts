import type { ChatMessageRole } from "@/features/chat/types";
import type { PersonaChatIdentity } from "@/features/persona/types";

export type AssistantAvatarIdentity =
  | { kind: "default" }
  | { kind: "persona"; name: string; avatarUrl?: string };

export function resolveAssistantAvatarIdentity(persona?: PersonaChatIdentity): AssistantAvatarIdentity {
  return persona ? { kind: "persona", name: persona.name, avatarUrl: persona.avatarUrl } : { kind: "default" };
}

export function resolveMessageAssistantPersona(role: ChatMessageRole, persona?: PersonaChatIdentity) {
  return role === "assistant" ? persona : undefined;
}
