import type { ConversationSummary } from "@/features/chat/types";
import type { PersonaChatIdentity } from "@/features/persona/types";

export interface ChatBootstrapPayload {
  conversations: ConversationSummary[];
  personas: PersonaChatIdentity[];
}
