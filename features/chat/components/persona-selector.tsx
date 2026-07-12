import Link from "next/link";
import { Bot } from "lucide-react";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaChatIdentity } from "@/features/persona/types";

export function PersonaSelector({ personas, selectedId }: { personas: PersonaChatIdentity[]; selectedId?: string }) {
  return <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6"><p className="mb-2 text-xs font-medium text-muted-foreground">选择本次新对话的助手</p><div className="flex gap-2 overflow-x-auto pb-2"><Link className={!selectedId ? "flex min-w-40 items-center gap-2 rounded-xl border-2 border-primary bg-primary/5 p-3" : "flex min-w-40 items-center gap-2 rounded-xl border p-3 hover:bg-muted"} href="/chat"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span><span className="text-sm font-medium">默认 AI 助手</span></Link>{personas.map((persona) => <Link className={selectedId === persona.id ? "flex min-w-52 items-center gap-2 rounded-xl border-2 border-primary bg-primary/5 p-3" : "flex min-w-52 items-center gap-2 rounded-xl border p-3 hover:bg-muted"} href={`/chat?personaId=${persona.id}`} key={persona.id}><PersonaAvatar className="size-10" name={persona.name} src={persona.avatarUrl} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{persona.name}</span><span className="block truncate text-xs text-muted-foreground">{persona.description || "AI 人格助手"}</span></span></Link>)}</div></div>;
}
