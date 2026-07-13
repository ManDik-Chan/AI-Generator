"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, ImageIcon, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiAvatarDialog } from "@/features/persona/components/ai-avatar-dialog";
import { PersonaActionsMenu } from "@/features/persona/components/persona-actions-menu";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaView } from "@/features/persona/types";

export function PersonaHeaderClient({ persona, imageConfigured }: { persona: PersonaView; imageConfigured: boolean }) {
  const [avatarUrl, setAvatarUrl] = useState(persona.avatarUrl);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [success, setSuccess] = useState<string>();
  return <>
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <PersonaAvatar className="size-28 rounded-[1.8rem] shadow-raised" name={persona.name} src={avatarUrl} />
      <div className="min-w-0 flex-1"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="premium-kicker">PRIVATE ASSISTANT</p>{persona.archivedAt && <span className="premium-chip">已在回收站</span>}</div><h1 className="mt-2 break-words text-page-title">{persona.name}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{persona.description || "暂无简介"}</p></div></div>
        <div className="mt-5 flex flex-wrap items-center gap-2">{!persona.archivedAt && <Button asChild><Link href={`/chat?personaId=${persona.id}`}><MessageCircle className="size-4" />开始对话</Link></Button>}<Button onClick={() => { setSuccess(undefined); setDialogOpen(true); }} type="button" variant="outline"><ImageIcon className="size-4" />AI 生成头像</Button><Button asChild variant="outline"><Link href={`/memories?personaId=${persona.id}`}><Brain className="size-4" />查看人格记忆</Link></Button><PersonaActionsMenu archived={Boolean(persona.archivedAt)} personaId={persona.id} personaName={persona.name} /></div>
        {success && <p className="mt-4 rounded-control bg-success-subtle p-3 text-sm text-success-foreground">{success}</p>}
      </div>
    </div>
    <AiAvatarDialog configured={imageConfigured} currentAvatarUrl={avatarUrl} initialPrompt={persona.avatarPrompt} onApplied={(next) => { setAvatarUrl(next); setSuccess("头像已更新"); setDialogOpen(false); }} onOpenChange={setDialogOpen} open={dialogOpen} personaId={persona.id} personaName={persona.name} />
  </>;
}
