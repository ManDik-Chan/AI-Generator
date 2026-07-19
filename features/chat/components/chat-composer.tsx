"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { BrainCircuit, Image as ImageIcon, MessageSquareText, Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getComposerPlaceholder, type ComposerDisabledReason } from "@/features/chat/composer-state";
import type { ChatGenerationMode } from "@/features/chat/types";

interface ChatComposerProps {
  value: string;
  disabledReason: ComposerDisabledReason;
  generating: boolean;
  stopping?: boolean;
  maxInputChars: number;
  mode: ChatGenerationMode;
  agentConfigured: boolean;
  onModeChange(mode: ChatGenerationMode): void;
  onChange(value: string): void;
  onSend(): void;
  onStop(): void;
}

export function ChatComposer(props: ChatComposerProps) {
  const composingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = Boolean(props.disabledReason);
  const selectedModeConfigured = props.mode === "CHAT" || props.agentConfigured;
  const canSend = props.value.trim().length > 0 && !disabled && selectedModeConfigured && !props.generating;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight) || 160;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [props.value]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const shell = container.closest<HTMLElement>("[data-chat-shell]");
    if (!shell) return;
    const update = () => shell.style.setProperty("--composer-height", `${Math.ceil(container.getBoundingClientRect().height)}px`);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    update();
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--composer-height");
    };
  }, []);

  return (
    <div className="safe-inline shrink-0 bg-gradient-to-t from-background via-background/96 to-transparent pb-[max(.75rem,var(--safe-area-bottom))] pt-3 sm:px-6 sm:pt-4" data-chat-composer ref={containerRef}>
      <div className="mx-auto max-w-[52rem]">
        <div className="premium-panel-strong flex items-end gap-2 rounded-[1.35rem] p-2.5 focus-within:border-primary/45 focus-within:shadow-raised sm:p-3">
          <Link aria-label="分析图片" className="grid size-11 shrink-0 place-items-center rounded-control text-muted-foreground transition hover:bg-primary-subtle hover:text-primary" href="/tools/image" title="打开图片理解"><ImageIcon className="size-4" /></Link>
          <textarea
            aria-label="消息内容"
            className="premium-scrollbar max-h-[min(10rem,35dvh)] min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 outline-none placeholder:text-muted-foreground sm:text-sm"
            disabled={disabled}
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
            placeholder={getComposerPlaceholder(props.disabledReason)}
            rows={1}
            ref={textareaRef}
            value={props.value}
          />
          {props.generating ? (
            <Button aria-label={props.stopping ? "正在请求停止" : "停止生成"} disabled={props.stopping} onClick={props.onStop} size="icon" title={props.stopping ? "正在请求停止" : "停止生成"} type="button" variant="outline"><Square className="size-4 fill-current" /></Button>
          ) : (
            <Button aria-label="发送消息" disabled={!canSend} onClick={props.onSend} size="icon" type="button"><Send className="size-4" /></Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <div aria-label="生成模式" className="flex min-w-0 flex-wrap gap-1" role="group">
            {([
              { value: "CHAT" as const, label: "常规", icon: MessageSquareText, title: "常规 Chat" },
              { value: "AGENT_STANDARD" as const, label: "Agent 标准", icon: BrainCircuit, title: "4 个动态 Worker · 1 Credit" },
              { value: "AGENT_DEEP" as const, label: "Agent 深度", icon: BrainCircuit, title: "6 个动态 Worker · 2 Credits" },
            ]).map((item) => <button
              aria-pressed={props.mode === item.value}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-2.5 text-xs font-semibold transition-colors ${props.mode === item.value ? "bg-primary-subtle text-primary-subtle-foreground" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}
              disabled={props.generating || Boolean(props.disabledReason === "editing") || (item.value !== "CHAT" && !props.agentConfigured)}
              key={item.value}
              onClick={() => props.onModeChange(item.value)}
              title={item.value !== "CHAT" && !props.agentConfigured ? "Agent 服务尚未配置" : item.title}
              type="button"
            ><item.icon className="size-3.5" />{item.label}</button>)}
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{props.value.length}/{props.maxInputChars}</span>
        </div>
        <p className="mt-1 px-2 text-[11px] text-muted-foreground">{props.mode === "CHAT" ? "AI 可能出错，请核实重要信息。" : "Worker 当前仅可推理，不会搜索、读取文件或执行代码。"}</p>
      </div>
    </div>
  );
}
