"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { restorePersonaFromTrash } from "@/features/persona/actions";

export function DeletedPersonaNotice({ personaId }: { personaId: string }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [error, setError] = useState<string>();
  return <div className="border-b border-warning/16 bg-warning-subtle/72 px-4 py-2.5 text-sm text-warning-foreground"><div className="mx-auto flex max-w-[52rem] flex-wrap items-center justify-center gap-2"><span>该人格已在回收站，恢复后可以继续对话。</span><Button disabled={pending} onClick={() => startTransition(async () => { setError(undefined); const result = await restorePersonaFromTrash(personaId); if (!result.success) setError(result.message); else router.refresh(); })} size="sm" type="button" variant="outline"><RotateCcw className="size-3.5" />{pending ? "正在恢复…" : "恢复人格"}</Button>{error && <span className="text-destructive-foreground">{error}</span>}</div></div>;
}
