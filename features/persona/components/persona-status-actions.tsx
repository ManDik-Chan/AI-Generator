"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archivePersonaAction, restorePersonaAction } from "@/features/persona/actions";

export function PersonaStatusActions({ personaId, archived }: { personaId: string; archived: boolean }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [confirming, setConfirming] = useState(false); const [error, setError] = useState<string>();
  if (archived) return <div>{error && <p className="mb-2 text-sm text-red-600">{error}</p>}<Button disabled={pending} onClick={() => startTransition(async () => { const result = await restorePersonaAction(personaId); if (!result.success) setError(result.message); else router.refresh(); })} variant="outline"><ArchiveRestore className="size-4" />{pending ? "正在恢复…" : "恢复人格"}</Button></div>;
  return <div>{error && <p className="mb-2 text-sm text-red-600">{error}</p>}{confirming ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><span className="mr-auto">归档后历史对话仍可继续，确认归档？</span><Button disabled={pending} onClick={() => setConfirming(false)} size="sm" variant="ghost">取消</Button><Button disabled={pending} onClick={() => startTransition(async () => { const result = await archivePersonaAction(personaId); if (!result.success) setError(result.message); else router.refresh(); setConfirming(false); })} size="sm"><Archive className="size-3.5" />确认归档</Button></div> : <Button onClick={() => setConfirming(true)} variant="outline"><Archive className="size-4" />归档人格</Button>}</div>;
}
