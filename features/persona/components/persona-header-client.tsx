"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageIcon, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiAvatarDialog } from "@/features/persona/components/ai-avatar-dialog";
import { PersonaActionsMenu } from "@/features/persona/components/persona-actions-menu";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaView } from "@/features/persona/types";

export function PersonaHeaderClient({ persona, imageConfigured }: { persona: PersonaView; imageConfigured: boolean }) {
  const [avatarUrl, setAvatarUrl] = useState(persona.avatarUrl); const [dialogOpen, setDialogOpen] = useState(false); const [success, setSuccess] = useState<string>();
  return <><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><PersonaAvatar className="size-24" name={persona.name} src={avatarUrl} /><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-semibold">{persona.name}</h1>{persona.archivedAt && <span className="rounded-full bg-muted px-2.5 py-1 text-xs">已删除</span>}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{persona.description || "暂无简介"}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2">{!persona.archivedAt && <Button asChild><Link href={`/chat?personaId=${persona.id}`}><MessageCircle className="size-4" />开始对话</Link></Button>}<Button onClick={() => { setSuccess(undefined); setDialogOpen(true); }} type="button" variant="outline"><ImageIcon className="size-4" />AI 生成头像</Button><PersonaActionsMenu archived={Boolean(persona.archivedAt)} personaId={persona.id} personaName={persona.name} /></div>{success && <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{success}</p>}</div></div><AiAvatarDialog configured={imageConfigured} currentAvatarUrl={avatarUrl} initialPrompt={persona.avatarPrompt} onApplied={(next) => { setAvatarUrl(next); setSuccess("头像已更新"); setDialogOpen(false); }} onOpenChange={setDialogOpen} open={dialogOpen} personaId={persona.id} personaName={persona.name} /></>;
}
