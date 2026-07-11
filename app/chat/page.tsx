import { ChatLayout } from "@/features/chat/components/chat-layout";
import { getConversationList } from "@/features/chat/queries";
import { getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await requireUser();
  const conversations = await getConversationList(user.id);
  const limits = getAiRuntimeLimits();

  return <ChatLayout aiConfigured={getAiConfigurationStatus().configured} conversation={null} conversations={conversations} maxInputChars={limits.maxInputChars} />;
}
