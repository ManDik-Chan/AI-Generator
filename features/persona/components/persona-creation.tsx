"use client";

import { useState } from "react";
import { Bot, Pencil } from "lucide-react";

import { AiPersonaGenerator, type GeneratedPersonaClientDraft } from "@/features/persona/components/ai-persona-generator";
import { PersonaForm } from "@/features/persona/components/persona-form";
import type { PersonaInput } from "@/features/persona/types";

export function PersonaCreation({ aiConfigured }: { aiConfigured: boolean }) {
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [draft, setDraft] = useState<PersonaInput>();
  const [avatarPrompt, setAvatarPrompt] = useState<string>();
  const [version, setVersion] = useState(0);

  function receive(generated: GeneratedPersonaClientDraft) {
    const persona: PersonaInput = {
      name: generated.name,
      avatarUrl: generated.avatarUrl,
      avatarChoice: "preset",
      avatarPrompt: generated.avatarPrompt,
      description: generated.description,
      identity: generated.identity,
      personality: generated.personality,
      speakingStyle: generated.speakingStyle,
      expertise: generated.expertise,
      greeting: generated.greeting,
      systemPrompt: "",
    };
    setAvatarPrompt(generated.avatarPrompt);
    setDraft(persona);
    setVersion((current) => current + 1);
  }

  const tabClass = (active: boolean) => active
    ? "flex min-h-11 items-center justify-center gap-2 rounded-[.65rem] bg-surface-raised text-sm font-semibold shadow-soft"
    : "flex min-h-11 items-center justify-center gap-2 rounded-[.65rem] text-sm text-muted-foreground hover:text-foreground";

  return <div className="space-y-6">
    <div aria-label="人格创建方式" className="mx-auto grid max-w-xl grid-cols-2 rounded-control bg-surface-muted p-1" role="tablist">
      <button aria-selected={mode === "manual"} className={tabClass(mode === "manual")} onClick={() => setMode("manual")} role="tab" type="button"><Pencil className="size-4" />手动创建</button>
      <button aria-selected={mode === "ai"} className={tabClass(mode === "ai")} onClick={() => setMode("ai")} role="tab" type="button"><Bot className="size-4" />AI 生成</button>
    </div>
    {mode === "ai" && <AiPersonaGenerator configured={aiConfigured} hasDraft={Boolean(draft)} onDraft={receive} />}
    {avatarPrompt && <div className="premium-panel border-primary/18 bg-primary-subtle/58 p-4"><p className="premium-kicker">AVATAR DIRECTION</p><p className="mt-2 text-sm font-medium">头像生成提示词</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{avatarPrompt}</p><p className="mt-2 text-xs text-muted-foreground">保存人格后，可在详情页根据此提示词生成头像。</p></div>}
    <PersonaForm draft={draft} key={version} />
  </div>;
}
