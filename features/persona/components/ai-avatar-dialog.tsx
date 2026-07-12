"use client";

import { useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { PERSONA_LIMITS } from "@/features/persona/constants";

interface Candidate { generatedImageId: string; previewUrl: string; prompt: string; width: number; height: number }

export function AiAvatarDialog({ personaId, personaName, initialPrompt = "", configured }: { personaId: string; personaName: string; initialPrompt?: string; configured: boolean }) {
  const router = useRouter(); const controller = useRef<AbortController | undefined>(undefined);
  const [open, setOpen] = useState(false); const [prompt, setPrompt] = useState(initialPrompt); const [candidate, setCandidate] = useState<Candidate>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function discard(next = candidate) { if (!next) return; await fetch(`/api/generated-images/${next.generatedImageId}`, { method: "DELETE" }); setCandidate(undefined); }
  async function generate() {
    if (candidate && !window.confirm("重新生成会放弃当前候选头像，是否继续？")) return;
    setBusy(true); setError(undefined); if (candidate) await discard(); const aborter = new AbortController(); controller.current = aborter;
    try { const response = await fetch(`/api/personas/${personaId}/avatar/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }), signal: aborter.signal }); const body = await response.json() as Candidate & { error?: string }; if (!response.ok) throw new Error(body.error || "头像生成失败，请稍后重试。"); setCandidate(body); setPrompt(body.prompt); }
    catch (reason) { setError(aborter.signal.aborted ? "头像生成已取消，当前头像未发生变化。" : reason instanceof Error ? reason.message : "头像生成失败，请稍后重试。"); }
    finally { setBusy(false); controller.current = undefined; }
  }
  async function apply() { if (!candidate) return; setBusy(true); setError(undefined); try { const response = await fetch(`/api/personas/${personaId}/avatar/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generatedImageId: candidate.generatedImageId, prompt }) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "头像应用失败。"); setCandidate(undefined); setOpen(false); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "头像应用失败。"); } finally { setBusy(false); } }
  async function close() { if (busy) { controller.current?.abort(); return; } await discard(); setOpen(false); setError(undefined); }
  return <>
    <Button onClick={() => setOpen(true)} type="button" variant="outline"><ImageIcon className="size-4" />AI 生成头像</Button>
    {open && <div aria-labelledby="ai-avatar-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/55 p-3" role="dialog">
      <div className="my-auto w-full max-w-xl rounded-2xl border bg-card p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold" id="ai-avatar-title">AI 生成头像</h2><p className="mt-1 text-sm text-muted-foreground">调用 GLM-Image 会产生费用，仅在点击生成后调用一次。</p></div><Button aria-label="关闭" disabled={busy} onClick={close} size="icon" type="button" variant="ghost"><X className="size-4" /></Button></div>
        {!configured ? <p className="mt-5 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">GLM-Image 或 Supabase 头像存储尚未配置。你仍可继续使用预设头像和人格聊天。</p> : <>
          <label className="mt-5 block text-sm font-medium" htmlFor="avatar-generation-prompt">头像提示词</label><textarea className="mt-2 min-h-32 w-full resize-y rounded-xl border bg-background p-3 text-sm" disabled={busy} id="avatar-generation-prompt" maxLength={PERSONA_LIMITS.avatarPrompt} onChange={(event) => setPrompt(event.target.value)} value={prompt} /><p className="mt-1 text-right text-xs text-muted-foreground">{prompt.length}/{PERSONA_LIMITS.avatarPrompt}</p>
          {candidate && <div className="mt-4 rounded-2xl bg-muted p-4"><PersonaAvatar className="mx-auto size-56 max-w-full" name={personaName} src={candidate.previewUrl} /><p className="mt-2 text-center text-xs text-muted-foreground">候选预览 · {candidate.width}×{candidate.height}</p></div>}
          {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button disabled={busy} onClick={close} type="button" variant="outline">{candidate ? "放弃" : "关闭"}</Button>{busy ? <Button onClick={() => controller.current?.abort()} type="button" variant="outline">取消请求</Button> : candidate ? <><Button onClick={generate} type="button" variant="outline">重新生成</Button><Button onClick={apply} type="button">使用此头像</Button></> : <Button disabled={!prompt.trim()} onClick={generate} type="button">生成头像</Button>}</div>
        </>}
      </div>
    </div>}
  </>;
}
