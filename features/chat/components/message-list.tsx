"use client";

import { useEffect, useRef } from "react";
import { MessageSquareText } from "lucide-react";

import { MessageItem } from "@/features/chat/components/message-item";
import { AssistantAvatar } from "@/features/chat/components/assistant-avatar";
import type { ChatMessageView } from "@/features/chat/types";
import type { PersonaChatIdentity } from "@/features/persona/types";

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
}

export function MessageList(props: MessageListProps) {
  const { messages } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    if (shouldFollowRef.current) {
      const container = containerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className="premium-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
      onScroll={(event) => {
        const element = event.currentTarget;
        shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
      }}
      ref={containerRef}
    >
      <div className="mx-auto w-full max-w-[52rem] space-y-8 px-3 pb-8 pt-6 sm:px-7 sm:py-9 lg:px-9">
        {messages.length ? messages.map((message) => {
          const lastUserId = [...messages].reverse().find((item) => item.role === "user")?.id;
          return <MessageItem
            canEdit={message.id === lastUserId}
            editDisabled={props.editDisabled}
            editing={message.id === props.editingMessageId}
            editValue={props.editValue}
            key={message.id}
            maxInputChars={props.maxInputChars}
            message={message}
            onBeginEdit={() => props.onBeginEdit(message)}
            onCancelEdit={props.onCancelEdit}
            onEditChange={props.onEditChange}
            onSubmitEdit={props.onSubmitEdit}
            persona={props.persona}
          />;
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
  );
}
