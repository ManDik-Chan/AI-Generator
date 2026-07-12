import Link from "next/link";
import { MessageCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaView } from "@/features/persona/types";

export function PersonaCard({ persona }: { persona: PersonaView }) {
  return <article className="flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm"><div className="flex min-w-0 gap-3"><PersonaAvatar className="size-14" name={persona.name} src={persona.avatarUrl} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Link className="truncate font-semibold hover:text-primary" href={`/personas/${persona.id}`}>{persona.name}</Link>{persona.archivedAt && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px]">已归档</span>}</div><p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{persona.description || "暂无简介"}</p><p className="mt-2 text-xs text-muted-foreground">更新于 {new Date(persona.updatedAt).toLocaleDateString("zh-CN")}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><Button asChild size="sm" variant="outline"><Link href={`/personas/${persona.id}/edit`}><Pencil className="size-3.5" />编辑</Link></Button>{!persona.archivedAt ? <Button asChild size="sm"><Link href={`/chat?personaId=${persona.id}`}><MessageCircle className="size-3.5" />开始对话</Link></Button> : <Button asChild size="sm" variant="ghost"><Link href={`/personas/${persona.id}`}>查看详情</Link></Button>}</div></article>;
}
