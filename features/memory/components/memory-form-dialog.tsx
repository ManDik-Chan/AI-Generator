"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createMemoryAction, updateMemoryAction } from "@/features/memory/actions";
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from "@/features/memory/constants";
import type { MemoryInput, MemoryView } from "@/features/memory/types";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  personas: Array<{ id: string; name: string }>;
  initial?: MemoryView;
  source?: { content: string; conversationId: string; messageId: string; personaId?: string };
  onSaved?(message: string): void;
}

export function MemoryFormDialog({ open, onOpenChange, personas, initial, source, onSaved }: Props) {
  const seed: MemoryInput = initial
    ? { content: initial.content, category: initial.category as MemoryInput["category"], scope: initial.scope, personaId: initial.personaId, importance: initial.importance, enabled: initial.enabled }
    : { content: source?.content ?? "", category: "other", scope: source?.personaId ? "PERSONA" : "GLOBAL", personaId: source?.personaId, importance: 3, enabled: true, origin: source ? "CHAT_MESSAGE" : "MANUAL", sourceConversationId: source?.conversationId, sourceMessageId: source?.messageId };
  const [value, setValue] = useState<MemoryInput>(seed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // Reset only when a different dialog payload opens; field edits must not retrigger this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setValue(seed); setError(undefined); } }, [open, initial?.id, source?.messageId]);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) onOpenChange(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [open, pending, onOpenChange]);
  if (!open) return null;

  return <div aria-labelledby="memory-form-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay/55 p-3 backdrop-blur-sm" onClick={() => !pending && onOpenChange(false)} role="dialog">
    <form className="premium-panel-strong my-auto w-full max-w-lg space-y-4 p-5 sm:p-6" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); startTransition(async () => { const result = initial ? await updateMemoryAction(initial.id, value) : await createMemoryAction(value); if (!result.success) { setError(result.message); return; } onSaved?.(result.message); onOpenChange(false); }); }}>
      <div className="flex items-start justify-between gap-3"><div><p className="premium-kicker">MEMORY EDITOR</p><h2 className="mt-1 text-lg font-semibold" id="memory-form-title">{initial ? "编辑记忆" : source ? "保存为记忆" : "创建记忆"}</h2><p className="mt-1 text-xs text-muted-foreground">请勿将密码、API Key 或访问令牌保存为长期记忆。</p></div><Button aria-label="关闭" disabled={pending} onClick={() => onOpenChange(false)} size="icon" type="button" variant="ghost"><X className="size-4" /></Button></div>
      {error && <p className="rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground" role="alert">{error}</p>}
      <label className="block text-sm font-medium">内容<textarea className="premium-field mt-2 min-h-28 p-3 text-sm leading-6" maxLength={500} onChange={(event) => setValue({ ...value, content: event.target.value })} value={value.content} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">类别<select className="premium-field mt-2 h-11 px-3" onChange={(event) => setValue({ ...value, category: event.target.value as MemoryInput["category"] })} value={value.category}>{MEMORY_CATEGORIES.map((category) => <option key={category} value={category}>{MEMORY_CATEGORY_LABELS[category]}</option>)}</select></label><label className="text-sm font-medium">作用范围<select className="premium-field mt-2 h-11 px-3" onChange={(event) => { const scope = event.target.value as "GLOBAL" | "PERSONA"; setValue({ ...value, scope, personaId: scope === "GLOBAL" ? undefined : value.personaId ?? personas[0]?.id }); }} value={value.scope}><option value="GLOBAL">全局记忆</option><option disabled={!personas.length} value="PERSONA">Persona 专属</option></select></label></div>
      {value.scope === "PERSONA" && <label className="block text-sm font-medium">Persona<select className="premium-field mt-2 h-11 px-3" onChange={(event) => setValue({ ...value, personaId: event.target.value })} value={value.personaId ?? ""}><option value="">请选择</option>{personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}</select></label>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">重要程度<select className="premium-field mt-2 h-11 px-3" onChange={(event) => setValue({ ...value, importance: Number(event.target.value) })} value={value.importance}>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}</select></label><label className="premium-subpanel flex min-h-11 items-center gap-3 self-end p-3 text-sm"><input checked={value.enabled} className="size-4 accent-[hsl(var(--primary))]" onChange={(event) => setValue({ ...value, enabled: event.target.checked })} type="checkbox" />启用此记忆</label></div>
      <div className="flex justify-end gap-2 border-t border-border/10 pt-4"><Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={pending} type="submit">{pending ? "正在保存…" : source ? "保存记忆" : initial ? "保存修改" : "创建记忆"}</Button></div>
    </form>
  </div>;
}
