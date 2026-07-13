"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Sparkles, X } from "lucide-react";

import { GenerationProgress, type GenerationStage } from "@/components/ai/generation-progress";
import { useElapsedTime } from "@/components/ai/use-elapsed-time";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { PERSONA_LIMITS } from "@/features/persona/constants";
import { readSseEvents } from "@/lib/ai/read-sse";

interface Candidate { generatedImageId: string; previewUrl: string; prompt: string; width: number; height: number }
const stages: GenerationStage[] = [
  { id: "preparing", label: "准备头像描述" },
  { id: "generating", label: "GLM-Image 正在绘制" },
  { id: "downloading", label: "下载生成结果" },
  { id: "validating", label: "安全检查" },
  { id: "uploading", label: "保存到私有存储" },
  { id: "saving", label: "准备候选头像" },
];

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  onApplied(avatarUrl: string): void;
  personaId: string;
  personaName: string;
  currentAvatarUrl?: string;
  initialPrompt?: string;
  configured: boolean;
}

export function AiAvatarDialog({ open, onOpenChange, onApplied, personaId, personaName, currentAvatarUrl, initialPrompt = "", configured }: Props) {
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const requestVersion = useRef(0);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [candidate, setCandidate] = useState<Candidate>();
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [activeStage, setActiveStage] = useState("preparing");
  const [error, setError] = useState<string>();
  const elapsed = useElapsedTime(generating);

  useEffect(() => () => { requestVersion.current += 1; controllerRef.current?.abort(); }, []);
  useEffect(() => { if (!open) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !applying) void close(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); });

  async function discard(next = candidate) {
    if (!next) return;
    try { await fetch(`/api/generated-images/${next.generatedImageId}`, { method: "DELETE" }); } catch { /* candidate can be cleaned up later */ }
    setCandidate((current) => current?.generatedImageId === next.generatedImageId ? undefined : current);
  }
  async function close() {
    requestVersion.current += 1; controllerRef.current?.abort(); controllerRef.current = undefined; setGenerating(false);
    if (!applying) { await discard(); setError(undefined); onOpenChange(false); }
  }
  async function generate() {
    if (candidate && !window.confirm("重新生成会替换当前候选头像，是否继续？")) return;
    const previous = candidate;
    const version = ++requestVersion.current;
    const controller = new AbortController();
    controllerRef.current = controller; setGenerating(true); setActiveStage("preparing"); setError(undefined);
    try {
      const response = await fetch(`/api/personas/${personaId}/avatar/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }), signal: controller.signal });
      let next: Candidate | undefined;
      let streamError: string | undefined;
      await readSseEvents(response, (name, data) => {
        if (version !== requestVersion.current || controller.signal.aborted) return;
        const payload = data as { stage?: string; message?: string; candidate?: Candidate };
        if (name === "progress" && payload.stage) setActiveStage(payload.stage);
        if (name === "done") next = payload.candidate;
        if (name === "error") streamError = payload.message || "头像生成失败，请稍后重试。";
      });
      if (version !== requestVersion.current || controller.signal.aborted) return;
      if (streamError) throw new Error(streamError);
      if (!next) throw new Error("头像生成失败，请稍后重试。");
      setCandidate(next); setPrompt(next.prompt);
      if (previous && previous.generatedImageId !== next.generatedImageId) await discard(previous);
    } catch (reason) {
      if (version !== requestVersion.current) return;
      setError(controller.signal.aborted ? "头像生成已取消，当前头像未发生变化。" : reason instanceof Error ? reason.message : "头像生成失败，请稍后重试。");
    } finally { if (version === requestVersion.current) { controllerRef.current = undefined; setGenerating(false); } }
  }
  async function apply() {
    if (!candidate || applying) return;
    setApplying(true); setError(undefined);
    try {
      const response = await fetch(`/api/personas/${personaId}/avatar/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generatedImageId: candidate.generatedImageId, prompt }) });
      const body = await response.json() as { error?: string; avatarUrl?: string };
      if (!response.ok || !body.avatarUrl) throw new Error(body.error || "头像应用失败。");
      onApplied(body.avatarUrl); setCandidate(undefined); onOpenChange(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "头像应用失败。"); }
    finally { setApplying(false); }
  }

  if (!open) return null;
  return <div aria-labelledby="ai-avatar-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay/60 p-3 backdrop-blur-sm" onClick={() => { if (!applying) void close(); }} role="dialog">
    <div className="premium-panel-strong my-auto w-full max-w-2xl overflow-hidden p-4 sm:p-6" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3 border-b border-border/10 pb-4"><div><p className="premium-kicker">AI AVATAR STUDIO</p><h2 className="mt-1 text-xl font-semibold tracking-[-.025em]" id="ai-avatar-title">AI 生成头像</h2><p className="mt-1 text-sm text-muted-foreground">仅在点击生成后调用一次；应用前不会改变当前头像。</p></div><Button aria-label="关闭" disabled={applying} onClick={() => void close()} size="icon" type="button" variant="ghost"><X className="size-4" /></Button></div>
      {!configured ? <p className="mt-5 rounded-control bg-warning-subtle p-4 text-sm text-warning-foreground">GLM-Image 或 Supabase 头像存储尚未配置。你仍可继续使用预设头像和人格聊天。</p> : generating ? <div className="mt-5"><GenerationProgress activeStage={activeStage} elapsedSeconds={elapsed} onCancel={() => { requestVersion.current += 1; controllerRef.current?.abort(); controllerRef.current = undefined; setGenerating(false); setError("头像生成已取消，当前头像未发生变化。"); }} stages={stages} title="正在生成头像" /></div> : <>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="premium-subpanel flex items-center gap-3 p-4"><PersonaAvatar className="size-16 rounded-[1rem]" name={personaName} src={currentAvatarUrl} /><div><p className="premium-kicker">CURRENT</p><p className="mt-1 text-sm font-medium">当前头像</p><p className="text-xs text-muted-foreground">生成候选前不会改变</p></div></div>{candidate ? <div className="premium-subpanel border-primary/18 bg-primary-subtle/55 p-4"><div className="flex items-center gap-3"><PersonaAvatar className="size-16 rounded-[1rem] shadow-soft" name={personaName} src={candidate.previewUrl} /><div><p className="premium-kicker">CANDIDATE</p><p className="mt-1 text-sm font-medium">候选头像</p><p className="text-xs text-muted-foreground">{candidate.width} × {candidate.height}</p></div></div></div> : <div className="surface-grid premium-subpanel grid min-h-24 place-items-center p-4 text-center"><span><Sparkles className="mx-auto size-5 text-primary" /><span className="mt-2 block text-xs text-muted-foreground">生成后的候选会显示在这里</span></span></div>}</div>
        <label className="mt-5 block text-sm font-medium" htmlFor="avatar-generation-prompt">头像提示词</label><textarea className="premium-field mt-2 min-h-32 resize-y p-3 text-sm leading-6" disabled={applying} id="avatar-generation-prompt" maxLength={PERSONA_LIMITS.avatarPrompt} onChange={(event) => setPrompt(event.target.value)} value={prompt} /><p className="mt-1 text-right text-xs text-muted-foreground">{prompt.length}/{PERSONA_LIMITS.avatarPrompt}</p>
        {candidate && <div className="premium-result mt-4 p-4"><PersonaAvatar className="mx-auto size-64 max-w-full rounded-[1.75rem] shadow-raised" name={personaName} src={candidate.previewUrl} /><p className="mt-3 text-center text-xs text-muted-foreground">候选预览 · 尚未应用</p></div>}
        {error && <p className="mt-4 rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground" role="alert">{error}</p>}
        {applying && <p className="mt-4 flex items-center gap-2 rounded-control bg-primary-subtle p-3 text-sm text-primary-subtle-foreground"><LoaderCircle className="size-4 animate-spin" />正在应用头像…</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border/10 pt-4 sm:flex-row sm:justify-end"><Button disabled={applying} onClick={() => void close()} type="button" variant="outline">{candidate ? "放弃" : "关闭"}</Button>{candidate ? <><Button disabled={applying} onClick={() => void generate()} type="button" variant="outline">重新生成</Button><Button disabled={applying} onClick={() => void apply()} type="button">{applying ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}使用此头像</Button></> : <Button disabled={applying || !prompt.trim()} onClick={() => void generate()} type="button"><Sparkles className="size-4" />生成头像</Button>}</div>
      </>}
    </div>
  </div>;
}
