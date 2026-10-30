import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { PageIntro, SampleTag, SectionHead, StatusPill } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { ChatPreview } from "@/features/platform/demo/chat-preview";

export const metadata: Metadata = { title: "对话" };

export default function DemoChatPage() {
  return (
    <div className="pb-6">
      <PageIntro
        actions={<Button asChild size="lg" variant="outline"><Link href="/login" prefetch={false}>登录后真实对话<ArrowUpRight className="size-4" /></Link></Button>}
        description="流式回答、会话历史、Markdown 与代码渲染，可绑定专属人格；回答下方标明本轮实际参考了哪些已确认记忆。下面用真实的消息组件渲染一段示例对话。"
        kicker="AI Hub · 对话"
        meta={<StatusPill status="live" />}
        title="对话是工作台的入口。"
      />
      <SectionHead meta={<SampleTag>示例对话 · 非真实回答</SampleTag>}>对话界面</SectionHead>
      <ChatPreview />
    </div>
  );
}
