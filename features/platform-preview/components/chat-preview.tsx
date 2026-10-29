"use client";

import Link from "next/link";
import { ArrowUp, MessageSquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MessageItem } from "@/features/chat/components/message-item";
import { previewConversations, previewMessages, previewPersonas } from "@/features/platform-preview/data/hub";
import { cn } from "@/lib/utils";

const noop = () => undefined;

/** The real chat message component with a hand-written sample conversation. */
export function ChatPreview() {
  const persona = previewPersonas[0];
  return (
    <div className="grid gap-0.5 min-[1024px]:grid-cols-[17rem_minmax(0,1fr)]">
      <aside aria-label="示例会话列表" className="rounded-card bg-surface p-3">
        <Button asChild className="w-full justify-start" size="sm" variant="outline"><Link href="/chat" prefetch={false}><MessageSquarePlus className="size-4" />新建对话（需登录）</Link></Button>
        <ul className="mt-3 space-y-0.5">
          {previewConversations.map((conversation) => (
            <li className={cn("rounded-control px-3 py-2.5", conversation.active ? "bg-background" : "")} key={conversation.id}>
              <p className="truncate text-sm font-medium">{conversation.title}</p>
              <p className="mt-0.5 truncate text-caption">{conversation.persona} · {conversation.updated}</p>
            </li>
          ))}
        </ul>
      </aside>
      <section aria-label="示例对话" className="flex min-h-[32rem] flex-col rounded-card bg-surface p-4 min-[821px]:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-border/10 pb-3">
          <p className="text-sm font-medium">{previewConversations[0].title}</p>
          <span className="premium-chip">人格 · {persona.name}</span>
        </div>
        <div className="flex-1 space-y-7">
          {previewMessages.map((message) => (
            <MessageItem canEdit={false} editDisabled editValue="" editing={false} key={message.id} maxInputChars={4000} message={message} onBeginEdit={noop} onCancelEdit={noop} onEditChange={noop} onSubmitEdit={noop} persona={persona} />
          ))}
        </div>
        <div className="mt-8 flex items-center gap-2 rounded-full border border-border/16 bg-surface-raised py-1.5 pl-5 pr-1.5">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">演示预览不能发送消息，登录后使用真实对话</p>
          <Button aria-label="发送（演示预览不可用）" disabled size="icon-sm"><ArrowUp className="size-4" /></Button>
        </div>
      </section>
    </div>
  );
}
