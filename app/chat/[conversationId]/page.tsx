import { notFound } from "next/navigation";

import { ChatLayout } from "@/features/chat/components/chat-layout";
import { getConversationDetail } from "@/features/chat/queries";
import { conversationIdSchema } from "@/features/chat/schemas";
import { getAgentConfigurationStatus, getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const user = await requireUser();
  const { conversationId } = await params;
  if (!conversationIdSchema.safeParse(conversationId).success) notFound();

  const conversation = await getConversationDetail(user.id, conversationId);
  if (!conversation) notFound();
  const limits = getAiRuntimeLimits();

  return <ChatLayout agentConfigured={getAgentConfigurationStatus().configured} aiConfigured={getAiConfigurationStatus().configured} bootstrapPersonas={false} conversation={conversation} conversations={[]} initialAgentRuns={[]} initialConversationKey={conversation.id} key={conversation.id} maxInputChars={limits.maxInputChars} viewerId={user.id} />;
}
