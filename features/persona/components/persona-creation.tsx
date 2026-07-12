"use client";

import { useState } from "react";
import { Bot, Pencil } from "lucide-react";
import { AiPersonaGenerator, type GeneratedPersonaClientDraft } from "@/features/persona/components/ai-persona-generator";
import { PersonaForm } from "@/features/persona/components/persona-form";
import type { PersonaInput } from "@/features/persona/types";

export function PersonaCreation({ aiConfigured }: { aiConfigured: boolean }) {
  const [mode, setMode] = useState<"manual" | "ai">("manual"); const [draft, setDraft] = useState<PersonaInput>(); const [avatarPrompt, setAvatarPrompt] = useState<string>(); const [version, setVersion] = useState(0);
  function receive(generated: GeneratedPersonaClientDraft) { const persona: PersonaInput = { name: generated.name, avatarUrl: generated.avatarUrl, avatarChoice: "preset", avatarPrompt: generated.avatarPrompt, description: generated.description, identity: generated.identity, personality: generated.personality, speakingStyle: generated.speakingStyle, expertise: generated.expertise, greeting: generated.greeting, systemPrompt: "" }; setAvatarPrompt(generated.avatarPrompt); setDraft(persona); setVersion((current) => current + 1); }
  return <div className="space-y-5"><div aria-label="人格创建方式" className="grid grid-cols-2 rounded-xl border bg-muted p-1" role="tablist"><button aria-selected={mode === "manual"} className={mode === "manual" ? "flex h-10 items-center justify-center gap-2 rounded-lg bg-background text-sm font-medium shadow-sm" : "flex h-10 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground"} onClick={() => setMode("manual")} role="tab" type="button"><Pencil className="size-4" />手动创建</button><button aria-selected={mode === "ai"} className={mode === "ai" ? "flex h-10 items-center justify-center gap-2 rounded-lg bg-background text-sm font-medium shadow-sm" : "flex h-10 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground"} onClick={() => setMode("ai")} role="tab" type="button"><Bot className="size-4" />AI 生成</button></div>{mode === "ai" && <AiPersonaGenerator configured={aiConfigured} hasDraft={Boolean(draft)} onDraft={receive} />}{avatarPrompt && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-medium">未来头像生成提示词</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{avatarPrompt}</p><p className="mt-2 text-xs text-muted-foreground">本阶段不会调用图片 API；保存只使用建议的本地预设头像。</p></div>}<PersonaForm draft={draft} key={version} /></div>;
}
