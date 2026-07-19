"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Bot, Check, Plus, Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaChatIdentity } from "@/features/persona/types";

interface AssistantSelectorPanelProps {
  personas: PersonaChatIdentity[];
  selectedId?: string;
  loading?: boolean;
  mobile?: boolean;
  onClose?(): void;
  onSelect(persona?: PersonaChatIdentity): void;
}

export function AssistantSelectorPanel({ personas, selectedId, loading = false, mobile = false, onClose, onSelect }: AssistantSelectorPanelProps) {
  useEffect(() => { if (!mobile) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose?.(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [mobile, onClose]);
  const itemClass = (selected: boolean) => `flex min-h-16 w-full min-w-0 items-center gap-3 rounded-control border p-3 text-left transition-[background-color,border-color,transform] ${selected ? "border-primary/22 bg-primary-subtle text-primary-subtle-foreground" : "border-border/10 bg-surface/58 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-surface-raised"}`;
  const content = <>
    <div className="shrink-0 border-b border-border/10 p-5">
      <div className="flex items-start justify-between gap-2"><div><p className="premium-kicker">ASSISTANT</p><h2 className="mt-1 text-lg font-semibold tracking-[-.025em]">选择助手</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">为这段新对话选择合适的身份</p></div>{mobile && <Button aria-label="关闭助手选择" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-4" /></Button>}</div>
    </div>
    <div className="premium-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
      <button aria-current={!selectedId ? "true" : undefined} className={itemClass(!selectedId)} onClick={() => { onSelect(); onClose?.(); }} type="button"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">默认 AI 助手</span><span className="block text-xs text-muted-foreground">通用对话助手</span></span>{!selectedId && <Check className="size-4 shrink-0 text-primary" />}</button>
      {loading ? <div aria-label="正在加载人格列表" className="space-y-2"><div className="h-16 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" /><div className="h-16 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" /></div> : personas.map((persona) => { const selected = selectedId === persona.id; return <button aria-current={selected ? "true" : undefined} className={itemClass(selected)} key={persona.id} onClick={() => { onSelect(persona); onClose?.(); }} type="button"><PersonaAvatar className="size-10 shrink-0" name={persona.name} src={persona.avatarUrl} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{persona.name}</span><span className="line-clamp-2 block text-xs leading-4 text-muted-foreground">{persona.description || "AI 人格助手"}</span></span>{selected && <Check className="size-4 shrink-0 text-primary" />}</button>; })}
    </div>
    <div className="grid shrink-0 gap-2 border-t border-border/10 p-4"><Button asChild size="sm"><Link href="/personas/new"><Plus className="size-4" />创建新人格</Link></Button><Button asChild size="sm" variant="outline"><Link href="/personas"><Settings className="size-4" />管理人格</Link></Button></div>
  </>;
  if (mobile) return <div aria-labelledby="mobile-assistant-selector-title" aria-modal="true" className="absolute inset-0 z-50 overflow-hidden bg-overlay/55 backdrop-blur-sm xl:hidden" onClick={onClose} role="dialog"><aside className="ml-auto flex h-full w-[min(90vw,21rem)] max-w-[calc(100vw-var(--safe-area-left)-.5rem)] flex-col border-l border-border/10 bg-background-subtle pb-[var(--safe-area-bottom)] shadow-2xl" onClick={(event) => event.stopPropagation()}><span className="sr-only" id="mobile-assistant-selector-title">选择助手</span>{content}</aside></div>;
  return <aside className="hidden w-[19rem] shrink-0 flex-col border-l border-border/10 bg-background-subtle/82 backdrop-blur-xl xl:flex">{content}</aside>;
}
