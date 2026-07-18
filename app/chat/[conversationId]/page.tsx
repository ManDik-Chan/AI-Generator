import { notFound } from "next/navigation";

import { ChatLayout } from "@/features/chat/components/chat-layout";
import { getConversationDetail, getConversationList } from "@/features/chat/queries";
import { conversationIdSchema } from "@/features/chat/schemas";
import { getAgentConfigurationStatus, getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";
import { getConversationAgentRuns } from "@/features/agents/queries";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const user = await requireUser();
  const { conversationId } = await params;
  if (!conversationIdSchema.safeParse(conversationId).success) notFound();

  const [conversations, conversation, agentRuns] = await Promise.all([
    getConversationList(user.id),
    getConversationDetail(user.id, conversationId),
    getConversationAgentRuns(user.id, conversationId),
  ]);
  if (!conversation) notFound();
  const limits = getAiRuntimeLimits();

  return <ChatLayout agentConfigured={getAgentConfigurationStatus().configured} aiConfigured={getAiConfigurationStatus().configured} conversation={conversation} conversations={conversations} initialAgentRuns={agentRuns} maxInputChars={limits.maxInputChars} />;
}
