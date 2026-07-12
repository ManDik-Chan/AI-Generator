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
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      onScroll={(event) => {
        const element = event.currentTarget;
        shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
      }}
      ref={containerRef}
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
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
          <div className="grid min-h-[45vh] place-items-center text-center">
            <div>
              {props.persona ? <AssistantAvatar className="mx-auto size-16 rounded-2xl" persona={props.persona} /> : <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><MessageSquareText className="size-6" /></span>}
              <h2 className="mt-4 text-xl font-semibold">{props.persona ? `与 ${props.persona.name} 开始对话` : "开始一段新对话"}</h2>
              <p className="mt-2 max-w-sm whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{props.persona?.greeting || (props.persona ? props.persona.description || "发送第一条消息开始对话。" : "向默认 AI 助手提问。它会使用 Markdown 清晰回答，并保留本次对话历史。")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
