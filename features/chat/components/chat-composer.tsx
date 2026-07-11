"use client";

import { useRef } from "react";
import { Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ChatComposerProps {
  value: string;
  disabled: boolean;
  generating: boolean;
  maxInputChars: number;
  onChange(value: string): void;
  onSend(): void;
  onStop(): void;
}

export function ChatComposer(props: ChatComposerProps) {
  const composingRef = useRef(false);
  const canSend = props.value.trim().length > 0 && !props.disabled && !props.generating;

  return (
    <div className="border-t bg-background/90 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-soft focus-within:border-primary/50">
          <textarea
            aria-label="消息内容"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            disabled={props.disabled}
            maxLength={props.maxInputChars}
            onChange={(event) => props.onChange(event.target.value)}
            onCompositionEnd={() => { composingRef.current = false; }}
            onCompositionStart={() => { composingRef.current = true; }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !composingRef.current) {
                event.preventDefault();
                if (canSend) props.onSend();
              }
            }}
            placeholder={props.disabled ? "AI 服务尚未配置" : "输入消息，Enter 发送，Shift + Enter 换行"}
            rows={1}
            value={props.value}
          />
          {props.generating ? (
            <Button aria-label="停止生成" onClick={props.onStop} size="icon" type="button" variant="outline"><Square className="size-4 fill-current" /></Button>
          ) : (
            <Button aria-label="发送消息" disabled={!canSend} onClick={props.onSend} size="icon" type="button"><Send className="size-4" /></Button>
          )}
        </div>
        <div className="mt-1.5 flex justify-between px-1 text-[11px] text-muted-foreground"><span>AI 可能出错，请核实重要信息。</span><span>{props.value.length}/{props.maxInputChars}</span></div>
      </div>
    </div>
  );
}
