"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { House, MessageSquare, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteConversationAction } from "@/features/chat/actions";
import { DeleteConversationDialog } from "@/features/chat/components/delete-conversation-dialog";
import { CHAT_HOME_NAVIGATION } from "@/features/chat/navigation";
import type { ConversationSummary } from "@/features/chat/types";

export function ConversationList({ conversations, activeId, onNavigate }: { conversations: ConversationSummary[]; activeId?: string; onNavigate?(): void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const [error, setError] = useState<string>();

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <Button asChild className="w-full justify-start" variant="outline">
          <Link href={CHAT_HOME_NAVIGATION.href} onClick={onNavigate}><House className="size-4" />{CHAT_HOME_NAVIGATION.label}</Link>
        </Button>
        <Button asChild className="w-full justify-start">
          <Link href="/chat" onClick={onNavigate}><Plus className="size-4" />新建对话</Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {error && <p className="mx-1 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>}
        {conversations.length ? (
          <nav aria-label="对话历史" className="space-y-1">
            {conversations.map((conversation) => (
              <div className={conversation.id === activeId ? "group flex items-center rounded-xl bg-muted" : "group flex items-center rounded-xl hover:bg-muted/70"} key={conversation.id}>
                <Link className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-sm" href={`/chat/${conversation.id}`} onClick={onNavigate}>
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{conversation.title}</span>
                </Link>
                <button aria-label={`删除 ${conversation.title}`} className="mr-1 rounded-lg p-2 text-muted-foreground opacity-70 hover:bg-background hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => setDeleting(conversation)} type="button"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </nav>
        ) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">还没有历史对话</p>}
      </div>
      {deleting && (
        <DeleteConversationDialog
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const result = await deleteConversationAction(deleting.id);
            if (!result.success) { setError(result.message); setDeleting(null); return; }
            setDeleting(null);
            router.push(result.nextConversationId ? `/chat/${result.nextConversationId}` : "/chat");
            router.refresh();
          }}
          title={deleting.title}
        />
      )}
    </div>
  );
}
