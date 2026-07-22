"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, MessageSquareText } from "lucide-react";
import dynamic from "next/dynamic";

import { MessageItem } from "@/features/chat/components/message-item";
import { AssistantAvatar } from "@/features/chat/components/assistant-avatar";
import type { ChatMessageView } from "@/features/chat/types";
import type { PersonaChatIdentity } from "@/features/persona/types";
import type { AgentRunView } from "@/features/agents/client-types";
import {
  CHAT_VIEWPORT_CHANGE_EVENT,
  getPreservedChatScrollTop,
  isChatScrollerNearBottom,
} from "@/features/chat/viewport";

const AgentWorkerPanel = dynamic(
  () => import("@/features/agents/components/agent-worker-panel").then((module) => module.AgentWorkerPanel),
  { loading: () => <div className="rounded-card border border-primary/18 bg-primary-subtle/24 p-4 text-sm text-muted-foreground">正在载入 Agent Worker 详情…</div> },
);

interface MessageListProps {
  messages: ChatMessageView[];
  editingMessageId?: string;
  editValue: string;
  maxInputChars: number;
  editDisabled: boolean;
  onBeginEdit(message: ChatMessageView): void;
  onCancelEdit(): void;
  onEditChange(value: string): void;
  onSubmitEdit(): void;
  persona?: PersonaChatIdentity;
  agentRuns: AgentRunView[];
  onCancelAgentRun(runId: string): Promise<void>;
  onCancelAgentWorker(runId: string, workerKey: string): Promise<void>;
  onRequestAgentDetails(runId: string): Promise<void>;
}

export function MessageList(props: MessageListProps) {
  const { messages } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const readingTopRef = useRef(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const preserveScrollPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const nextTop = getPreservedChatScrollTop({
      previousScrollTop: readingTopRef.current,
      nextScrollHeight: container.scrollHeight,
      nextClientHeight: container.clientHeight,
      shouldFollow: shouldFollowRef.current,
    });
    if (Math.abs(container.scrollTop - nextTop) >= 1) container.scrollTop = nextTop;
    readingTopRef.current = nextTop;
    setShowScrollToBottom(!shouldFollowRef.current && container.scrollHeight > container.clientHeight);
  }, []);

  useLayoutEffect(() => {
    preserveScrollPosition();
  }, [messages, preserveScrollPosition]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    const shell = container?.closest<HTMLElement>("[data-chat-shell]");
    if (!container || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(preserveScrollPosition);
    observer.observe(container);
    observer.observe(content);
    shell?.addEventListener(CHAT_VIEWPORT_CHANGE_EVENT, preserveScrollPosition);
    preserveScrollPosition();
    return () => {
      observer.disconnect();
      shell?.removeEventListener(CHAT_VIEWPORT_CHANGE_EVENT, preserveScrollPosition);
    };
  }, [preserveScrollPosition]);

  const lastUserId = [...messages].reverse().find((item) => item.role === "user")?.id;
  const agentByAssistantId = new Map(props.agentRuns.map((run) => [run.assistantMessageId, run]));

  return (
    <div className="relative min-h-0 flex-1">
    <div
      className="premium-scrollbar h-full min-h-0 overflow-y-auto overscroll-contain [overflow-anchor:none]"
      data-chat-message-scroll
      onScroll={(event) => {
        const element = event.currentTarget;
        const nearBottom = isChatScrollerNearBottom(element.scrollHeight, element.scrollTop, element.clientHeight);
        shouldFollowRef.current = nearBottom;
        readingTopRef.current = element.scrollTop;
        setShowScrollToBottom(!nearBottom);
      }}
      ref={containerRef}
    >
      <div className="mx-auto w-full max-w-[52rem] space-y-8 px-3 pb-8 pt-6 sm:px-7 sm:py-9 lg:px-9" ref={contentRef}>
        {messages.length ? messages.map((message) => {
          const agentRun = message.role === "assistant" ? agentByAssistantId.get(message.id) : undefined;
          return <Fragment key={message.id}>
            {agentRun ? <AgentWorkerPanel onCancelRun={props.onCancelAgentRun} onCancelWorker={props.onCancelAgentWorker} onRequestDetails={props.onRequestAgentDetails} run={agentRun} /> : null}
            <MessageItem
            canEdit={message.id === lastUserId}
            editDisabled={props.editDisabled}
            editing={message.id === props.editingMessageId}
            editValue={props.editValue}
            maxInputChars={props.maxInputChars}
            message={message}
            onBeginEdit={() => props.onBeginEdit(message)}
            onCancelEdit={props.onCancelEdit}
            onEditChange={props.onEditChange}
            onSubmitEdit={props.onSubmitEdit}
            persona={props.persona}
            />
          </Fragment>;
        }) : (
          <div className="grid min-h-[55vh] place-items-center py-10 text-center">
            <div className="relative max-w-lg">
              <div className="premium-aurora absolute left-1/2 top-8 -z-10 h-44 w-44 -translate-x-1/2 rounded-full bg-primary/14 blur-3xl" />
              {props.persona ? <AssistantAvatar className="mx-auto size-20 rounded-[1.65rem] shadow-raised" persona={props.persona} /> : <span className="premium-icon-tile mx-auto size-20 rounded-[1.65rem] shadow-raised"><MessageSquareText className="size-7" /></span>}
              <p className="premium-kicker mt-6">NEW CONVERSATION</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] sm:text-3xl">{props.persona ? `与 ${props.persona.name} 开始对话` : "今天想一起完成什么？"}</h2>
              <p className="mx-auto mt-3 max-w-md whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{props.persona?.greeting || (props.persona ? props.persona.description || "发送第一条消息开始对话。" : "默认助手已准备好。提出问题、梳理想法，或从一个尚未成形的灵感开始。")}</p>
              <div className="mx-auto mt-6 h-px w-20 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            </div>
          </div>
        )}
      </div>
    </div>
    {showScrollToBottom ? <button aria-label="回到底部" className="absolute bottom-3 left-1/2 z-10 grid size-11 -translate-x-1/2 place-items-center rounded-full border border-border/14 bg-surface-raised text-foreground shadow-overlay transition-transform hover:-translate-y-0.5 motion-reduce:transform-none" onClick={() => { const container = containerRef.current; if (container) { shouldFollowRef.current = true; readingTopRef.current = Math.max(0, container.scrollHeight - container.clientHeight); container.scrollTo({ top: container.scrollHeight, behavior: "smooth" }); setShowScrollToBottom(false); } }} type="button"><ArrowDown className="size-4" /></button> : null}
    </div>
  );
}
