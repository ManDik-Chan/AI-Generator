import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { buildPersonaPreview } from "@/features/persona/prompt";
import type { PersonaInput } from "@/features/persona/types";

export function PersonaPreview({ persona }: { persona: PersonaInput }) {
  return (
    <aside className="premium-panel-strong relative overflow-hidden p-5 lg:sticky lg:top-8">
      <div className="absolute -right-10 -top-10 size-36 rounded-full bg-primary/12 blur-3xl" />
      <div className="relative"><p className="premium-kicker">LIVE PREVIEW</p><p className="mt-1 text-xs text-muted-foreground">只使用当前表单中的真实输入</p></div>
      <div className="relative mt-6 flex flex-col items-center text-center"><PersonaAvatar className="size-24 rounded-[1.65rem] shadow-raised" name={persona.name || "AI"} src={persona.avatarUrl} /><h2 className="mt-4 max-w-full truncate text-xl font-semibold tracking-[-.03em]">{persona.name || "未命名人格"}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{persona.description || "填写简介后会在这里显示这个助手适合做什么。"}</p></div>
      {persona.expertise && <div className="relative mt-4 flex justify-center"><span className="premium-chip max-w-full border-primary/14 bg-primary-subtle text-primary-subtle-foreground"><span className="truncate">{persona.expertise}</span></span></div>}
      {persona.greeting ? <div className="premium-subpanel relative mt-5 p-4 text-sm leading-6"><p className="premium-kicker mb-2">GREETING</p>{persona.greeting}</div> : <div className="premium-subpanel relative mt-5 p-4 text-sm text-muted-foreground">填写开场白后，空对话欢迎语会在这里预览。</div>}
      <details className="relative mt-4"><summary className="min-h-11 cursor-pointer rounded-control px-2 py-3 text-sm font-medium hover:bg-surface-muted">查看最终人格 Prompt</summary><pre className="premium-scrollbar mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-control bg-[#101716] p-4 text-xs leading-5 text-[#eff7f3]">{buildPersonaPreview(persona)}</pre></details>
    </aside>
  );
}
