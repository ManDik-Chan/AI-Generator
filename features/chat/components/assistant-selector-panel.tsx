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
  mobile?: boolean;
  onClose?(): void;
  onSelect(persona?: PersonaChatIdentity): void;
}

export function AssistantSelectorPanel({ personas, selectedId, mobile = false, onClose, onSelect }: AssistantSelectorPanelProps) {
  useEffect(() => { if (!mobile) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose?.(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [mobile, onClose]);
  const itemClass = (selected: boolean) => `flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/10 ring-1 ring-primary/20" : "bg-card hover:bg-muted"}`;
  const content = <>
    <div className="shrink-0 border-b p-4">
      <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">选择助手</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">选择本次新对话使用的 AI 助手</p></div>{mobile && <Button aria-label="关闭助手选择" onClick={onClose} size="icon" type="button" variant="ghost"><X className="size-4" /></Button>}</div>
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <button aria-current={!selectedId ? "true" : undefined} className={itemClass(!selectedId)} onClick={() => { onSelect(); onClose?.(); }} type="button"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">默认 AI 助手</span><span className="block text-xs text-muted-foreground">通用对话助手</span></span>{!selectedId && <Check className="size-4 shrink-0 text-primary" />}</button>
      {personas.map((persona) => { const selected = selectedId === persona.id; return <button aria-current={selected ? "true" : undefined} className={itemClass(selected)} key={persona.id} onClick={() => { onSelect(persona); onClose?.(); }} type="button"><PersonaAvatar className="size-10 shrink-0" name={persona.name} src={persona.avatarUrl} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{persona.name}</span><span className="line-clamp-2 block text-xs leading-4 text-muted-foreground">{persona.description || "AI 人格助手"}</span></span>{selected && <Check className="size-4 shrink-0 text-primary" />}</button>; })}
    </div>
    <div className="grid shrink-0 gap-2 border-t p-3"><Button asChild size="sm"><Link href="/personas/new"><Plus className="size-4" />创建新人格</Link></Button><Button asChild size="sm" variant="outline"><Link href="/personas"><Settings className="size-4" />管理人格</Link></Button></div>
  </>;
  if (mobile) return <div aria-labelledby="mobile-assistant-selector-title" aria-modal="true" className="fixed inset-0 z-50 bg-black/45 xl:hidden" onClick={onClose} role="dialog"><aside className="ml-auto flex h-full w-[min(88vw,20rem)] flex-col border-l bg-card" onClick={(event) => event.stopPropagation()}><span className="sr-only" id="mobile-assistant-selector-title">选择助手</span>{content}</aside></div>;
  return <aside className="hidden w-72 shrink-0 flex-col border-l bg-card/70 xl:flex">{content}</aside>;
}
