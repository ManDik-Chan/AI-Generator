import Link from "next/link";
import { ArrowUpRight, MessageCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PersonaActionsMenu } from "@/features/persona/components/persona-actions-menu";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaView } from "@/features/persona/types";

export function PersonaCard({ persona }: { persona: PersonaView }) {
  return (
    <article className="group premium-panel relative flex min-h-[18rem] min-w-0 flex-col overflow-hidden p-5 transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-1 hover:border-primary/26 hover:shadow-raised">
      <div className="absolute right-0 top-0 size-32 rounded-full bg-primary/7 blur-3xl transition-transform duration-panel group-hover:scale-125" />
      <div className="relative flex min-w-0 items-start gap-4">
        <PersonaAvatar className="size-16 rounded-[1.2rem] shadow-soft" name={persona.name} src={persona.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="premium-kicker">ACTIVE ASSISTANT</p><Link className="mt-1 block truncate text-lg font-semibold tracking-[-.025em] hover:text-primary" href={`/personas/${persona.id}`} prefetch={false}>{persona.name}</Link></div>
            <PersonaActionsMenu archived={Boolean(persona.archivedAt)} personaId={persona.id} personaName={persona.name} />
          </div>
        </div>
      </div>
      <p className="relative mt-5 line-clamp-3 text-sm leading-6 text-muted-foreground">{persona.description || "暂无简介。打开详情可以补充这个助手的身份与表达方式。"}</p>
      <div className="relative mt-4 flex min-h-8 flex-wrap gap-2">
        {persona.expertise ? <span className="premium-chip max-w-full"><Sparkles className="size-3 text-primary" /><span className="truncate">{persona.expertise}</span></span> : <span className="premium-chip">尚未填写擅长领域</span>}
      </div>
      <div className="relative mt-auto flex flex-col items-start justify-between gap-3 border-t border-border/10 pt-4 min-[360px]:flex-row min-[360px]:items-end">
        <p className="text-[.6875rem] text-muted-foreground">更新于 {new Date(persona.updatedAt).toLocaleDateString("zh-CN")}</p>
        <div className="flex w-full gap-1.5 min-[360px]:w-auto">
          <Button asChild aria-label={`查看 ${persona.name}`} size="icon" variant="ghost"><Link href={`/personas/${persona.id}`} prefetch={false}><ArrowUpRight className="size-4" /></Link></Button>
          <Button asChild className="flex-1 min-[360px]:flex-none" size="sm"><Link href={`/chat?personaId=${persona.id}`}><MessageCircle className="size-3.5" />开始对话</Link></Button>
        </div>
      </div>
    </article>
  );
}
