import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { buildPersonaPreview } from "@/features/persona/prompt";
import type { PersonaInput } from "@/features/persona/types";

export function PersonaPreview({ persona }: { persona: PersonaInput }) {
  return (
    <aside className="rounded-2xl border bg-card p-5 lg:sticky lg:top-8">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">实时预览</p>
      <div className="mt-4 flex items-center gap-3"><PersonaAvatar className="size-14" name={persona.name || "AI"} src={persona.avatarUrl} /><div className="min-w-0"><h2 className="truncate font-semibold">{persona.name || "未命名人格"}</h2><p className="line-clamp-2 text-sm text-muted-foreground">{persona.description || "还没有简介"}</p></div></div>
      {persona.greeting && <div className="mt-4 rounded-xl bg-muted p-3 text-sm leading-6">{persona.greeting}</div>}
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">查看最终人格 Prompt</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-xs leading-5">{buildPersonaPreview(persona)}</pre></details>
    </aside>
  );
}
