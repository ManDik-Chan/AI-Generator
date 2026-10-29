import type { Metadata } from "next";

import { BlockLabel, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { ChatPreview } from "@/features/platform-preview/components/chat-preview";
import { SampleBadge } from "@/features/platform-preview/components/status-badge";
import { hubModules } from "@/features/platform-preview/navigation";

export const metadata: Metadata = { title: "Chat 对话" };

export default function PlatformChatPage() {
  return (
    <div className="pb-6">
      <PreviewHeader
        description="流式回答、会话历史、Markdown 与代码渲染，可绑定专属人格，并在回答下方标明本轮参考了哪些已确认记忆。下方使用真实的消息组件渲染一段示例对话。"
        module={hubModules[0]}
        title="对话是工作台的入口。"
      />
      <BlockLabel meta={<SampleBadge label="示例对话 · 非真实回答" />}>对话界面</BlockLabel>
      <ChatPreview />
    </div>
  );
}
