import { ChatLayout } from "@/features/chat/components/chat-layout";
import { getConversationList } from "@/features/chat/queries";
import { getAgentConfigurationStatus, getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
import { getActivePersonaChoices } from "@/features/persona/queries";
import { personaIdSchema } from "@/features/persona/schemas";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ personaId?: string }> }) {
  const user = await requireUser();
  const [conversations, personas] = await Promise.all([getConversationList(user.id), getActivePersonaChoices(user.id)]);
  const requestedPersonaId = (await searchParams).personaId;
  const selectedPersona = requestedPersonaId && personaIdSchema.safeParse(requestedPersonaId).success ? personas.find((persona) => persona.id === requestedPersonaId) : undefined;
  const limits = getAiRuntimeLimits();

  return <ChatLayout agentConfigured={getAgentConfigurationStatus().configured} aiConfigured={getAiConfigurationStatus().configured} conversation={null} conversations={conversations} initialAgentRuns={[]} maxInputChars={limits.maxInputChars} personas={personas} selectedPersona={selectedPersona} />;
}
