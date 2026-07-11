import { AlertCircle, Bot, UserRound } from "lucide-react";

import { MarkdownMessage } from "@/features/chat/components/markdown-message";
import type { ChatMessageView } from "@/features/chat/types";

export function MessageItem({ message }: { message: ChatMessageView }) {
  const isUser = message.role === "user";

  return (
    <article className={isUser ? "flex justify-end gap-3" : "flex justify-start gap-3"}>
      {!isUser && <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-4" /></span>}
      <div className={isUser ? "max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-primary-foreground sm:max-w-[75%]" : "min-w-0 max-w-[calc(100%_-_2.75rem)] flex-1 rounded-2xl border bg-card px-4 py-3 sm:px-5"}>
        {isUser ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p> : <MarkdownMessage content={message.content} />}
        {!isUser && message.status === "pending" && !message.content && (
          <div className="flex items-center gap-1.5 py-2 text-sm text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-current" /><span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" /></div>
        )}
        {!isUser && message.status === "error" && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-300"><AlertCircle className="size-3.5" />本次生成未正常完成</p>
        )}
      </div>
      {isUser && <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl border bg-card"><UserRound className="size-4" /></span>}
    </article>
  );
}
