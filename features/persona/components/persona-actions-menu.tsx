"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { movePersonaToTrash, restorePersonaFromTrash } from "@/features/persona/actions";

export function PersonaActionsMenu({ personaId, personaName, archived }: { personaId: string; personaName: string; archived: boolean }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  function restore() { startTransition(async () => { setError(undefined); const result = await restorePersonaFromTrash(personaId); if (!result.success) setError(result.message); else router.refresh(); }); }
  function moveToTrash() { startTransition(async () => { setError(undefined); const result = await movePersonaToTrash(personaId); if (!result.success) setError(result.message); else { setDeleteOpen(false); router.push("/personas?trashed=1"); router.refresh(); } }); }

  return <div className="relative shrink-0">
    <Dropdown placement="bottom-end" trigger={<span aria-label="人格操作" className="grid size-11 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground"><MoreHorizontal className="size-5" /></span>}>
      <Link className="flex min-h-11 items-center gap-2 rounded-control px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground" href={`/personas/${personaId}/edit`} role="menuitem"><Pencil className="size-4" />编辑人格</Link>
      {archived ? <button className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground" disabled={pending} onClick={restore} role="menuitem" type="button"><RotateCcw className="size-4" />恢复人格</button> : <button className="flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-sm text-destructive-foreground hover:bg-surface-muted" onClick={() => setDeleteOpen(true)} role="menuitem" type="button"><Trash2 className="size-4" />移至回收站</button>}
      {error && <p className="max-w-48 break-words px-2 py-1 text-xs text-destructive-foreground">{error}</p>}
    </Dropdown>
    <Dialog description="该人格不再出现在新对话助手列表中。已有聊天记录不会被删除，之后仍可恢复。" footer={<><Button disabled={pending} onClick={() => setDeleteOpen(false)} type="button" variant="outline">取消</Button><Button className="bg-destructive text-white hover:bg-destructive/90" disabled={pending} onClick={moveToTrash} type="button"><Trash2 className="size-4" />{pending ? "正在处理…" : "移至回收站"}</Button></>} onOpenChange={(open) => { if (!pending) setDeleteOpen(open); }} open={deleteOpen} title={`将“${personaName}”移至回收站？`}>{error && <p className="rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground">{error}</p>}</Dialog>
  </div>;
}
