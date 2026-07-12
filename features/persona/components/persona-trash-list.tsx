"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restorePersonaFromTrash } from "@/features/persona/actions";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaView } from "@/features/persona/types";

export function PersonaTrashList({ personas }: { personas: PersonaView[] }) {
  const router = useRouter(); const [pendingId, setPendingId] = useState<string>(); const [pending, startTransition] = useTransition(); const [error, setError] = useState<string>();
  return <div className="space-y-3">{error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error}</p>}{personas.map((persona) => <article className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border bg-card p-4" key={persona.id}><PersonaAvatar className="size-12" name={persona.name} src={persona.avatarUrl} /><div className="min-w-0 flex-1"><Link className="truncate font-semibold hover:text-primary" href={`/personas/${persona.id}`}>{persona.name}</Link><p className="mt-1 text-xs text-muted-foreground">移入时间 {new Date(persona.archivedAt || persona.updatedAt).toLocaleString("zh-CN")}</p></div><Button disabled={pending && pendingId === persona.id} onClick={() => { setPendingId(persona.id); setError(undefined); startTransition(async () => { const result = await restorePersonaFromTrash(persona.id); if (!result.success) setError(result.message); else router.refresh(); setPendingId(undefined); }); }} size="sm" type="button"><RotateCcw className="size-4" />{pending && pendingId === persona.id ? "正在恢复…" : "恢复人格"}</Button></article>)}</div>;
}
