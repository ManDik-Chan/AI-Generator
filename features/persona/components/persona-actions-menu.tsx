"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { movePersonaToTrash, restorePersonaFromTrash } from "@/features/persona/actions";
import { AiAvatarDialog } from "@/features/persona/components/ai-avatar-dialog";

export function PersonaActionsMenu({ personaId, personaName, avatarPrompt, archived, imageConfigured }: { personaId: string; personaName: string; avatarPrompt?: string; archived: boolean; imageConfigured: boolean }) {
  const router = useRouter(); const [menuOpen, setMenuOpen] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false); const [pending, startTransition] = useTransition(); const [error, setError] = useState<string>();
  function restore() { startTransition(async () => { setError(undefined); const result = await restorePersonaFromTrash(personaId); if (!result.success) setError(result.message); else { setMenuOpen(false); router.refresh(); } }); }
  function moveToTrash() { startTransition(async () => { setError(undefined); const result = await movePersonaToTrash(personaId); if (!result.success) setError(result.message); else { setDeleteOpen(false); router.push("/personas?trashed=1"); router.refresh(); } }); }
  return <div className="relative shrink-0">
    <Button aria-expanded={menuOpen} aria-haspopup="menu" aria-label="人格操作" onClick={() => setMenuOpen((value) => !value)} size="icon" type="button" variant="ghost"><MoreHorizontal className="size-5" /></Button>
    {menuOpen && <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border bg-card p-1.5 shadow-xl" role="menu"><Button asChild className="w-full justify-start" size="sm" variant="ghost"><Link href={`/personas/${personaId}/edit`}><Pencil className="size-4" />编辑人格</Link></Button><AiAvatarDialog configured={imageConfigured} initialPrompt={avatarPrompt} menuItem onOpen={() => setMenuOpen(false)} personaId={personaId} personaName={personaName} />{archived ? <Button className="w-full justify-start" disabled={pending} onClick={restore} size="sm" type="button" variant="ghost"><RotateCcw className="size-4" />恢复人格</Button> : <Button className="w-full justify-start text-red-600 hover:text-red-700" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }} size="sm" type="button" variant="ghost"><Trash2 className="size-4" />删除人格</Button>}{error && <p className="px-2 py-1 text-xs text-red-600">{error}</p>}</div>}
    {deleteOpen && <div aria-labelledby="delete-persona-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => !pending && setDeleteOpen(false)} role="dialog"><div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold" id="delete-persona-title">删除“{personaName}”？</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">该人格将被移入回收站，不再出现在新对话的助手列表中。已有聊天记录不会被删除，你可以稍后从回收站恢复。</p></div><Button aria-label="关闭" disabled={pending} onClick={() => setDeleteOpen(false)} size="icon" type="button" variant="ghost"><X className="size-4" /></Button></div>{error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button disabled={pending} onClick={() => setDeleteOpen(false)} type="button" variant="outline">取消</Button><Button className="bg-red-600 text-white hover:bg-red-700" disabled={pending} onClick={moveToTrash} type="button"><Trash2 className="size-4" />{pending ? "正在处理…" : "移至回收站"}</Button></div></div></div>}
  </div>;
}
