import { ChatLayout } from "@/features/chat/components/chat-layout";
import { getAgentConfigurationStatus, getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
import { personaIdSchema } from "@/features/persona/schemas";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ personaId?: string }> }) {
  const [user, requested] = await Promise.all([requireUser(), searchParams]);
  const requestedPersonaId = requested.personaId && personaIdSchema.safeParse(requested.personaId).success ? requested.personaId : undefined;
  const limits = getAiRuntimeLimits();
  const conversationKey = `new:${randomUUID()}`;

  return <ChatLayout agentConfigured={getAgentConfigurationStatus().configured} aiConfigured={getAiConfigurationStatus().configured} conversation={null} conversations={[]} initialAgentRuns={[]} initialConversationKey={conversationKey} key={conversationKey} maxInputChars={limits.maxInputChars} personas={[]} requestedPersonaId={requestedPersonaId} viewerId={user.id} />;
}
import { randomUUID } from "node:crypto";
