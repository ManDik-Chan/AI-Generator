"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { House, MessageSquare, Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteConversationAction } from "@/features/chat/actions";
import { DeleteConversationDialog } from "@/features/chat/components/delete-conversation-dialog";
import { CHAT_HOME_NAVIGATION } from "@/features/chat/navigation";
import type { ConversationSummary } from "@/features/chat/types";

export function ConversationList({ conversations, activeId, loading = false, onNavigate }: { conversations: ConversationSummary[]; activeId?: string; loading?: boolean; onNavigate?(): void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const [error, setError] = useState<string>();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/10 p-4">
        <Link className="mb-4 flex items-center gap-3 rounded-control px-1 py-1" href={CHAT_HOME_NAVIGATION.href} onClick={onNavigate}>
          <span className="premium-icon-tile size-10"><Sparkles className="size-4" /></span>
          <span><span className="block text-sm font-bold">AI-Generator</span><span className="block text-[.625rem] font-semibold uppercase tracking-[.14em] text-muted-foreground">Conversation Studio</span></span>
        </Link>
        <Button asChild className="w-full justify-start" size="lg">
          <Link href="/chat" onClick={onNavigate}><Plus className="size-4" />新建对话</Link>
        </Button>
        <Button asChild className="mt-2 w-full justify-start" variant="ghost">
          <Link href={CHAT_HOME_NAVIGATION.href} onClick={onNavigate}><House className="size-4" />{CHAT_HOME_NAVIGATION.label}</Link>
        </Button>
      </div>
      <div className="premium-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="premium-kicker mb-2 px-2">RECENT</p>
        {error && <p className="mx-1 mb-2 rounded-control bg-destructive-subtle px-3 py-2 text-xs text-destructive-foreground">{error}</p>}
        {loading ? <div aria-label="正在加载对话历史" className="space-y-2"><div className="h-12 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" /><div className="h-12 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" /><div className="h-12 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" /></div> : conversations.length ? (
          <nav aria-label="对话历史" className="space-y-1">
            {conversations.map((conversation) => (
              <div className={conversation.id === activeId ? "group flex items-center rounded-control border border-primary/14 bg-primary-subtle text-primary-subtle-foreground shadow-sm" : "group flex items-center rounded-control border border-transparent text-muted-foreground hover:border-border/10 hover:bg-surface/60 hover:text-foreground"} key={conversation.id}>
                <Link aria-current={conversation.id === activeId ? "page" : undefined} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-sm" href={`/chat/${conversation.id}`} onClick={onNavigate} prefetch={false}>
                  <MessageSquare className={conversation.id === activeId ? "size-4 shrink-0 text-primary" : "size-4 shrink-0"} />
                  <span className="truncate">{conversation.title}</span>
                </Link>
                <button aria-label={`删除 ${conversation.title}`} className="mr-1 grid size-10 place-items-center rounded-control text-muted-foreground opacity-70 hover:bg-surface-raised hover:text-destructive sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100" onClick={() => setDeleting(conversation)} type="button"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </nav>
        ) : <div className="premium-subpanel px-4 py-8 text-center"><MessageSquare className="mx-auto size-5 text-primary" /><p className="mt-3 text-sm font-medium">还没有历史对话</p><p className="mt-1 text-xs leading-5 text-muted-foreground">第一段真实对话会出现在这里。</p></div>}
      </div>
      {deleting && (
        <DeleteConversationDialog
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const result = await deleteConversationAction(deleting.id);
            if (!result.success) { setError(result.message); setDeleting(null); return; }
            setDeleting(null);
            router.push(result.nextConversationId ? `/chat/${result.nextConversationId}` : "/chat");
          }}
          title={deleting.title}
        />
      )}
    </div>
  );
}
