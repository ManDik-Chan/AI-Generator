"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { movePersonaToTrash, restorePersonaFromTrash } from "@/features/persona/actions";

export function PersonaActionsMenu({ personaId, personaName, archived }: { personaId: string; personaName: string; archived: boolean }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  useEffect(() => { if (!menuOpen && !deleteOpen) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) { setMenuOpen(false); setDeleteOpen(false); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [menuOpen, deleteOpen, pending]);
  function restore() { startTransition(async () => { setError(undefined); const result = await restorePersonaFromTrash(personaId); if (!result.success) setError(result.message); else { setMenuOpen(false); router.refresh(); } }); }
  function moveToTrash() { startTransition(async () => { setError(undefined); const result = await movePersonaToTrash(personaId); if (!result.success) setError(result.message); else { setDeleteOpen(false); router.push("/personas?trashed=1"); router.refresh(); } }); }

  return <div className="relative shrink-0">
    <Button aria-expanded={menuOpen} aria-haspopup="menu" aria-label="人格操作" onClick={() => setMenuOpen((value) => !value)} size="icon" type="button" variant="ghost"><MoreHorizontal className="size-5" /></Button>
    {menuOpen && <div className="premium-panel-strong absolute right-0 top-12 z-20 w-48 p-1.5" role="menu"><Button asChild className="w-full justify-start" size="sm" variant="ghost"><Link href={`/personas/${personaId}/edit`}><Pencil className="size-4" />编辑人格</Link></Button>{archived ? <Button className="w-full justify-start" disabled={pending} onClick={restore} size="sm" type="button" variant="ghost"><RotateCcw className="size-4" />恢复人格</Button> : <Button className="w-full justify-start text-destructive-foreground" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }} size="sm" type="button" variant="ghost"><Trash2 className="size-4" />移至回收站</Button>}{error && <p className="px-2 py-1 text-xs text-destructive-foreground">{error}</p>}</div>}
    {deleteOpen && <div aria-labelledby="delete-persona-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-overlay/55 p-4 backdrop-blur-sm" onClick={() => !pending && setDeleteOpen(false)} role="dialog"><div className="premium-panel-strong w-full max-w-md p-5 sm:p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="premium-kicker">ARCHIVE PERSONA</p><h2 className="mt-1 text-lg font-semibold" id="delete-persona-title">将“{personaName}”移至回收站？</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">该人格不再出现在新对话助手列表中。已有聊天记录不会被删除，之后仍可恢复。</p></div><Button aria-label="关闭" disabled={pending} onClick={() => setDeleteOpen(false)} size="icon" type="button" variant="ghost"><X className="size-4" /></Button></div>{error && <p className="mt-4 rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground">{error}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-border/10 pt-4"><Button disabled={pending} onClick={() => setDeleteOpen(false)} type="button" variant="outline">取消</Button><Button className="bg-destructive text-white hover:bg-destructive/90" disabled={pending} onClick={moveToTrash} type="button"><Trash2 className="size-4" />{pending ? "正在处理…" : "移至回收站"}</Button></div></div></div>}
  </div>;
}
