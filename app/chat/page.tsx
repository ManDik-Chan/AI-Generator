import { ChatLayout } from "@/features/chat/components/chat-layout";
import { getAgentConfigurationStatus, getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
import { personaIdSchema } from "@/features/persona/schemas";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ personaId?: string }> }) {
  const [, requested] = await Promise.all([requireUser(), searchParams]);
  const requestedPersonaId = requested.personaId && personaIdSchema.safeParse(requested.personaId).success ? requested.personaId : undefined;
  const limits = getAiRuntimeLimits();

  return <ChatLayout agentConfigured={getAgentConfigurationStatus().configured} aiConfigured={getAiConfigurationStatus().configured} conversation={null} conversations={[]} initialAgentRuns={[]} maxInputChars={limits.maxInputChars} personas={[]} requestedPersonaId={requestedPersonaId} />;
}
