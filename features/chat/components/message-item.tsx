"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Check, Pencil, UserRound, X } from "lucide-react";

import { AssistantAvatar } from "@/features/chat/components/assistant-avatar";
import { MarkdownMessage } from "@/features/chat/components/markdown-message";
import { resolveMessageAssistantPersona } from "@/features/chat/assistant-identity";
import type { ChatMessageView } from "@/features/chat/types";
import { MEMORY_CATEGORY_LABELS } from "@/features/memory/constants";
import { getMemoryVerificationLabel } from "@/features/memory/verification";
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
    <article className={isUser ? "group flex min-w-0 justify-end gap-2.5 sm:gap-3" : "group flex min-w-0 justify-start gap-2.5 sm:gap-4"}>
      {!isUser && <AssistantAvatar className="mt-1" persona={resolveMessageAssistantPersona(message.role, props.persona)} />}
      <div className={isUser ? "max-w-[88%] rounded-[1.35rem] rounded-tr-[.4rem] bg-foreground px-4 py-3.5 text-background shadow-soft sm:max-w-[76%] sm:px-5" : "min-w-0 max-w-[calc(100%_-_2.75rem)] flex-1 border-l border-primary/18 pl-4 pr-1 py-1 sm:max-w-[calc(100%_-_3.5rem)] sm:pl-5"}>
        {isUser && props.editing ? (
          <div className="space-y-2">
            <textarea
              aria-label="编辑消息"
              className="min-h-24 w-full resize-y rounded-control border border-background/25 bg-background/10 p-3 text-base outline-none focus:border-background/50 sm:text-sm"
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
          <p className="mt-4 flex items-center gap-1.5 rounded-control bg-destructive-subtle px-3 py-2 text-xs text-destructive-foreground"><AlertCircle className="size-3.5" />本次生成未正常完成</p>
        )}
        {!isUser && message.status === "complete" && message.memoryDisclosure ? (
          <details className="mt-4 min-w-0 overflow-hidden rounded-control border border-primary/12 bg-primary-subtle/50 text-sm">
            <summary className="cursor-pointer break-words px-3 py-2.5 font-medium text-primary-subtle-foreground">
              {message.memoryDisclosure.items.some(
                (item) => item.verificationMethod === "LEGACY_UNREVIEWED",
              )
                ? `本轮参考了 ${message.memoryDisclosure.count} 条正式记忆（含旧版未复核）`
                : `本轮参考了 ${message.memoryDisclosure.count} 条已确认记忆`}
            </summary>
            <div className="grid min-w-0 gap-2 border-t border-primary/10 p-2.5">
              {message.memoryDisclosure.items.map((item) => {
                const legacy = item.verificationMethod === "LEGACY_UNREVIEWED";
                return (
                  <div
                    className={legacy
                      ? "min-w-0 rounded-control border border-warning/20 bg-warning-subtle p-3"
                      : "min-w-0 rounded-control border border-border/10 bg-surface/70 p-3"}
                    key={item.id}
                  >
                    <p className="whitespace-pre-wrap break-words leading-6">
                      {item.content}
                    </p>
                    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-[.6875rem]">
                      <span className="premium-chip">
                        {MEMORY_CATEGORY_LABELS[
                          item.category as keyof typeof MEMORY_CATEGORY_LABELS
                        ] ?? item.category}
                      </span>
                      <span className="premium-chip">
                        {item.scope === "GLOBAL" ? "全局" : "当前 Persona"}
                      </span>
                      <span className={legacy
                        ? "premium-chip border-warning/20 bg-warning-subtle text-warning-foreground"
                        : "premium-chip"}
                      >
                        {getMemoryVerificationLabel(item.verificationMethod)}
                      </span>
                    </div>
                    {legacy ? (
                      <p className="mt-2 break-words text-xs leading-5 text-warning-foreground">
                        这是旧版自动整理且尚未复核的记忆，不代表用户已确认；当前仍会按设置参与召回。
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>
      {isUser && <div className="mt-1 flex shrink-0 flex-col items-center gap-1">
        <span className="grid size-9 place-items-center rounded-control border border-border/12 bg-surface-raised shadow-sm"><UserRound className="size-4" /></span>
        {props.canEdit && !props.editing && <button
          aria-label={props.editDisabled ? "停止生成并编辑此消息" : "编辑最后一条消息"}
          className="grid size-11 place-items-center rounded-control text-muted-foreground opacity-80 hover:bg-surface-muted hover:text-foreground focus-visible:opacity-100 sm:size-9 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={props.onBeginEdit}
          title={props.editDisabled ? "停止并编辑" : "编辑"}
          type="button"
        ><Pencil className="size-3.5" /></button>}
      </div>}
    </article>
  );
}
