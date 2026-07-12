"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Check, Pencil, UserRound, X } from "lucide-react";

import { AssistantAvatar } from "@/features/chat/components/assistant-avatar";
import { MarkdownMessage } from "@/features/chat/components/markdown-message";
import { resolveMessageAssistantPersona } from "@/features/chat/assistant-identity";
import type { ChatMessageView } from "@/features/chat/types";
import type { PersonaChatIdentity } from "@/features/persona/types";

interface MessageItemProps {
  message: ChatMessageView;
  canEdit: boolean;
  editing: boolean;
  editValue: string;
  maxInputChars: number;
  editDisabled: boolean;
  onBeginEdit(): void;
  onCancelEdit(): void;
  onEditChange(value: string): void;
  onSubmitEdit(): void;
  persona?: PersonaChatIdentity;
}

export function MessageItem(props: MessageItemProps) {
  const { message } = props;
  const isUser = message.role === "user";
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = props.editValue.trim().length > 0
    && props.editValue.trim() !== message.content.trim()
    && !props.editDisabled;

  useEffect(() => {
    if (props.editing) editorRef.current?.focus();
  }, [props.editing]);

  return (
    <article className={isUser ? "flex justify-end gap-3" : "flex justify-start gap-3"}>
      {!isUser && <AssistantAvatar className="mt-1" persona={resolveMessageAssistantPersona(message.role, props.persona)} />}
      <div className={isUser ? "max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-primary-foreground sm:max-w-[75%]" : "min-w-0 max-w-[calc(100%_-_2.75rem)] flex-1 rounded-2xl border bg-card px-4 py-3 sm:px-5"}>
        {isUser && props.editing ? (
          <div className="space-y-2">
            <textarea
              aria-label="编辑消息"
              className="min-h-24 w-full resize-y rounded-lg border border-primary-foreground/30 bg-primary-foreground/10 p-2 text-sm outline-none"
              maxLength={props.maxInputChars}
              onChange={(event) => props.onEditChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") props.onCancelEdit();
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  if (canSubmit) props.onSubmitEdit();
                }
              }}
              ref={editorRef}
              value={props.editValue}
            />
            <div className="flex items-center justify-between text-xs">
              <span>{props.editValue.length}/{props.maxInputChars}</span>
              <span className="flex gap-1">
                <button aria-label="取消编辑" className="rounded p-1.5 hover:bg-primary-foreground/15" onClick={props.onCancelEdit} type="button"><X className="size-4" /></button>
                <button aria-label="提交编辑" className="rounded p-1.5 hover:bg-primary-foreground/15 disabled:opacity-40" disabled={!canSubmit} onClick={props.onSubmitEdit} type="button"><Check className="size-4" /></button>
              </span>
            </div>
          </div>
        ) : isUser ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p> : <MarkdownMessage content={message.content} />}
        {!isUser && message.status === "pending" && !message.content && (
          <div className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-current" /><span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" /></div>
        )}
        {!isUser && message.status === "error" && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-300"><AlertCircle className="size-3.5" />本次生成未正常完成</p>
        )}
      </div>
      {isUser && <div className="mt-1 flex shrink-0 flex-col items-center gap-1">
        <span className="grid size-8 place-items-center rounded-xl border bg-card"><UserRound className="size-4" /></span>
        {props.canEdit && !props.editing && <button
          aria-label={props.editDisabled ? "停止生成并编辑此消息" : "编辑最后一条消息"}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:p-1.5"
          onClick={props.onBeginEdit}
          title={props.editDisabled ? "停止并编辑" : "编辑"}
          type="button"
        ><Pencil className="size-3.5" /></button>}
      </div>}
    </article>
  );
}
