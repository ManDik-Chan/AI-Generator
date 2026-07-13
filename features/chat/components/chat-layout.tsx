"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Bot, House, Menu, Sparkles, X } from "lucide-react";

import { ChatComposer } from "@/features/chat/components/chat-composer";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { MessageList } from "@/features/chat/components/message-list";
import { AssistantSelectorPanel } from "@/features/chat/components/assistant-selector-panel";
import { DeletedPersonaNotice } from "@/features/chat/components/deleted-persona-notice";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaChatIdentity } from "@/features/persona/types";
import { confirmOptimisticTurn, createEditRequestTarget } from "@/features/chat/client-state";
import { getComposerDisabledReason } from "@/features/chat/composer-state";
import { CHAT_HOME_NAVIGATION } from "@/features/chat/navigation";
import type { ChatMessageView, ChatStreamEvent, ConversationDetail, ConversationSummary } from "@/features/chat/types";

interface ChatLayoutProps {
  conversations: ConversationSummary[];
  conversation: ConversationDetail | null;
  aiConfigured: boolean;
  maxInputChars: number;
  personas?: PersonaChatIdentity[];
  selectedPersona?: PersonaChatIdentity;
}

async function readChatEvents(response: Response, onEvent: (event: ChatStreamEvent) => void) {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "消息发送失败，请稍后重试。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (event && data) {
        try { onEvent({ event, data: JSON.parse(data) } as ChatStreamEvent); } catch { /* Ignore malformed app events. */ }
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
}

export function ChatLayout({ conversations, conversation, aiConfigured, maxInputChars, personas = [], selectedPersona }: ChatLayoutProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>(conversation?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const [activePersona, setActivePersona] = useState(selectedPersona);
  const [controller, setController] = useState<AbortController>();
  const [editingMessage, setEditingMessage] = useState<ChatMessageView>();
  const [editValue, setEditValue] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(conversation?.id);
  const [activeTitle, setActiveTitle] = useState(conversation?.title);
  const activeConversationRef = useRef<{ id?: string; updatedAt?: string }>({ id: conversation?.id });
  const pendingStopEditRef = useRef(false);

  function selectAssistant(persona?: PersonaChatIdentity) {
    setActivePersona(persona);
    const nextUrl = persona ? `/chat?personaId=${encodeURIComponent(persona.id)}` : "/chat";
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  async function sendMessage(messageToEdit?: ChatMessageView) {
    const content = (messageToEdit ? editValue : draft).trim();
    if (!content || generating || !aiConfigured) return;

    const editTarget = messageToEdit ? createEditRequestTarget({
      message: messageToEdit,
      conversationId: activeConversationRef.current.id ?? conversation?.id,
      conversationUpdatedAt: activeConversationRef.current.updatedAt,
    }) : undefined;
    if (messageToEdit && !editTarget) {
      setError("正在确认对话，请稍后重试编辑。");
      return;
    }

    const requestController = new AbortController();
    let userId = `user-${crypto.randomUUID()}`;
    let assistantId = `assistant-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    let assistantContent = "";
    const previousMessages = messages;
    const editIndex = messageToEdit ? messages.findIndex((message) => message.id === messageToEdit.id) : -1;
    if (messageToEdit && editIndex < 0) return;
    if (messageToEdit) {
      setEditingMessage(undefined);
      setEditValue("");
    } else setDraft("");
    setError(undefined);
    setGenerating(true);
    setController(requestController);
    pendingStopEditRef.current = false;
    if (!messageToEdit && !activeConversationRef.current.id) {
      setActiveTitle(content.replace(/\s+/g, " ").slice(0, 48));
    }
    const retainedMessages = editIndex >= 0 ? messages.slice(0, editIndex) : messages;
    setMessages([...retainedMessages,
      { id: userId, role: "user", content, status: "complete", createdAt: now, temporary: true },
      { id: assistantId, role: "assistant", content: "", status: "pending", createdAt: now, temporary: true },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, ...(editTarget ?? { conversationId: activeConversationRef.current.id, ...(!activeConversationRef.current.id && activePersona ? { personaId: activePersona.id } : {}) }) }),
        signal: requestController.signal,
      });

      await readChatEvents(response, (streamEvent) => {
        if (streamEvent.event === "conversation") {
          const firstConfirmation = !activeConversationRef.current.id;
          activeConversationRef.current = { id: streamEvent.data.conversationId, updatedAt: streamEvent.data.updatedAt };
          setActiveConversationId(streamEvent.data.conversationId);
          if (firstConfirmation) window.history.replaceState(window.history.state, "", `/chat/${streamEvent.data.conversationId}`);
          queueMicrotask(() => {
            if (pendingStopEditRef.current) {
              pendingStopEditRef.current = false;
              requestController.abort();
            }
          });
        }
        if (streamEvent.event === "turn") {
          const temporaryUserId = userId;
          const temporaryAssistantId = assistantId;
          userId = streamEvent.data.userMessageId;
          assistantId = streamEvent.data.assistantMessageId;
          setMessages((current) => confirmOptimisticTurn(current, temporaryUserId, temporaryAssistantId, userId, assistantId));
          setEditingMessage((current) => current?.id === temporaryUserId ? { ...current, id: userId, temporary: false } : current);
          if (pendingStopEditRef.current) {
            pendingStopEditRef.current = false;
            requestController.abort();
          }
        }
        if (streamEvent.event === "delta") {
          assistantContent += streamEvent.data.text;
          setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: assistantContent } : message));
        }
        if (streamEvent.event === "memory") setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, memoryCount: streamEvent.data.count } : message));
        if (streamEvent.event === "done") {
          setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, id: streamEvent.data.messageId, status: "complete" } : message));
        }
        if (streamEvent.event === "error") {
          setError(streamEvent.data.message);
          setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "error" } : message));
        }
      });

    } catch (caughtError) {
      if (requestController.signal.aborted) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: assistantContent ? "complete" : "error" } : message));
      } else {
        if (messageToEdit) {
          setMessages(previousMessages);
          setEditingMessage(messageToEdit);
          setEditValue(content);
        } else {
          setDraft(content);
          setMessages(previousMessages);
        }
        setError(caughtError instanceof Error ? caughtError.message : "消息发送失败，请稍后重试。");
      }
    } finally {
      setGenerating(false);
      setController(undefined);
      pendingStopEditRef.current = false;
    }
  }

  function beginEdit(message: ChatMessageView) {
    setEditingMessage(message);
    setEditValue(message.content);
    setError(undefined);
    if (generating) {
      if (message.temporary && !activeConversationRef.current.updatedAt) {
        pendingStopEditRef.current = true;
      } else {
        controller?.abort();
      }
    }
  }

  return (
    <div className="surface-grid flex h-[100dvh] max-w-[100vw] overflow-hidden bg-background" data-chat-shell>
      <aside className="hidden w-[17.5rem] shrink-0 border-r border-border/10 bg-background-subtle/82 backdrop-blur-xl md:block"><ConversationList activeId={activeConversationId} conversations={conversations} /></aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-overlay/55 backdrop-blur-sm md:hidden" onClick={() => setDrawerOpen(false)}>
          <aside className="flex h-full w-[min(88vw,21rem)] flex-col border-r border-border/10 bg-background-subtle shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-[4.25rem] items-center justify-between border-b border-border/10 px-4"><div><span className="premium-kicker">CONVERSATIONS</span><p className="text-sm font-semibold">对话历史</p></div><button aria-label="关闭历史" className="grid size-11 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground" onClick={() => setDrawerOpen(false)} type="button"><X className="size-5" /></button></div>
            <ConversationList activeId={activeConversationId} conversations={conversations} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}
      <section className="flex min-w-0 flex-1 flex-col bg-background/72">
        <header className="flex h-[4.25rem] shrink-0 items-center gap-1.5 border-b border-border/10 bg-surface/72 px-2.5 backdrop-blur-xl sm:gap-2 sm:px-4 md:gap-3 md:px-6">
          <button aria-label="打开对话历史" className="grid size-11 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground md:hidden" onClick={() => setDrawerOpen(true)} type="button"><Menu className="size-5" /></button>
          <Link aria-label={CHAT_HOME_NAVIGATION.label} className="grid size-11 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground md:hidden" href={CHAT_HOME_NAVIGATION.href} title={CHAT_HOME_NAVIGATION.title}><House className="size-5" /></Link>
          <Link aria-label={CHAT_HOME_NAVIGATION.label} className="shrink-0" href={CHAT_HOME_NAVIGATION.href} title={CHAT_HOME_NAVIGATION.title}>{conversation?.persona || activePersona ? <PersonaAvatar className="size-8 rounded-xl" name={(conversation?.persona || activePersona)!.name} src={(conversation?.persona || activePersona)!.avatarUrl} /> : <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"><Sparkles className="size-4" /></span>}</Link>
          <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold tracking-[-.01em]">{activeTitle ?? activePersona?.name ?? "新对话"}</h1><p className="truncate text-xs text-muted-foreground">{conversation?.persona ? `${conversation.persona.description || "AI 人格助手"}${conversation.persona.archived ? " · 已在回收站" : ""}` : activePersona?.description || (activePersona ? "AI 人格助手" : "默认 AI 助手")}</p></div>
          {!activeConversationId && <button aria-label="选择助手" className="grid size-11 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground xl:hidden" onClick={() => setAssistantDrawerOpen(true)} title="选择助手" type="button"><Bot className="size-5" /></button>}
          {generating && <span className="premium-chip hidden shrink-0 border-primary/15 bg-primary-subtle text-primary-subtle-foreground sm:inline-flex"><span className="size-1.5 animate-pulse rounded-full bg-primary" />正在生成</span>}
        </header>
        {!aiConfigured && <div className="border-b border-warning/16 bg-warning-subtle/72 px-4 py-2.5 text-center text-sm text-warning-foreground">AI 服务尚未配置。请由管理员设置服务端 AI 环境变量。</div>}
        {error && <div className="border-b border-destructive/16 bg-destructive-subtle/76 px-4 py-2.5 text-center text-sm text-destructive-foreground" role="alert">{error}</div>}
        {conversation?.persona?.archived && <DeletedPersonaNotice personaId={conversation.persona.id} />}
        <div className="flex min-h-0 min-w-0 flex-1"><main className="flex min-w-0 flex-1 flex-col"><MessageList
          editDisabled={generating}
          editingMessageId={editingMessage?.id}
          editValue={editValue}
          maxInputChars={maxInputChars}
          messages={messages}
          onBeginEdit={beginEdit}
          onCancelEdit={() => { setEditingMessage(undefined); setEditValue(""); pendingStopEditRef.current = false; }}
          onEditChange={setEditValue}
          onSubmitEdit={() => { if (editingMessage) void sendMessage(editingMessage); }}
          persona={conversation?.persona || activePersona}
        />
        <ChatComposer
          disabledReason={getComposerDisabledReason(aiConfigured, Boolean(editingMessage), Boolean(conversation?.persona?.archived))}
          generating={generating}
          maxInputChars={maxInputChars}
          onChange={setDraft}
          onSend={() => void sendMessage()}
          onStop={() => controller?.abort()}
          value={draft}
        />
        </main>{!activeConversationId && <AssistantSelectorPanel onSelect={selectAssistant} personas={personas} selectedId={activePersona?.id} />}</div>
        {!activeConversationId && assistantDrawerOpen && <AssistantSelectorPanel mobile onClose={() => setAssistantDrawerOpen(false)} onSelect={selectAssistant} personas={personas} selectedId={activePersona?.id} />}
      </section>
    </div>
  );
}
