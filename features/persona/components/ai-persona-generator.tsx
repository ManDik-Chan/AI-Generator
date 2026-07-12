"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { GenerationProgress, type GenerationStage } from "@/components/ai/generation-progress";
import { useElapsedTime } from "@/components/ai/use-elapsed-time";
import { Button } from "@/components/ui/button";
import { readSseEvents } from "@/lib/ai/read-sse";
import type { PersonaInput } from "@/features/persona/types";

export interface GeneratedPersonaClientDraft extends PersonaInput { avatarPrompt: string; avatarPresetId: string }
const stages: GenerationStage[] = [
  { id: "preparing", label: "整理角色需求" }, { id: "generating", label: "调用 AI 生成", detail: "正在生成身份、性格、表达方式和开场白" },
  { id: "validating", label: "校验人格结构", detail: "检查字段、头像建议和输出格式" }, { id: "repairing", label: "修复返回格式" }, { id: "drafting", label: "准备可编辑草稿" },
];
const examples = ["温和但严格的大学计算机老师，擅长网络和数据库，先给结论再给考试速记。", "冷静可靠的职业规划顾问，善于提出具体问题，回答简洁且不夸大承诺。", "充满想象力的科幻小说编辑，重视人物动机、节奏和世界观一致性。"];

export function AiPersonaGenerator({ configured, hasDraft, onDraft }: { configured: boolean; hasDraft: boolean; onDraft(draft: GeneratedPersonaClientDraft): void }) {
  const [description, setDescription] = useState(""); const [loading, setLoading] = useState(false); const [activeStage, setActiveStage] = useState("preparing"); const [repairingSeen, setRepairingSeen] = useState(false); const [error, setError] = useState<string>(); const [success, setSuccess] = useState<string>(); const controllerRef = useRef<AbortController | undefined>(undefined); const requestVersion = useRef(0); const elapsed = useElapsedTime(loading);
  useEffect(() => () => { requestVersion.current += 1; controllerRef.current?.abort(); }, []);
  async function generate() {
    if (hasDraft && !window.confirm("重新生成会覆盖当前未保存的人格内容，是否继续？")) return;
    const content = description.trim(); if (content.length < 10 || content.length > 1500 || loading) return;
    const version = ++requestVersion.current; const controller = new AbortController(); controllerRef.current = controller; setLoading(true); setActiveStage("preparing"); setRepairingSeen(false); setError(undefined); setSuccess(undefined);
    try {
      const response = await fetch("/api/personas/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: content }), signal: controller.signal }); let draft: GeneratedPersonaClientDraft | undefined; let streamError: string | undefined;
      await readSseEvents(response, (name, data) => { if (version !== requestVersion.current || controller.signal.aborted) return; const payload = data as { stage?: string; message?: string; draft?: GeneratedPersonaClientDraft }; if (name === "progress" && payload.stage) { setActiveStage(payload.stage); if (payload.stage === "repairing") setRepairingSeen(true); } if (name === "done") draft = payload.draft; if (name === "error") streamError = payload.message || "AI 人格生成失败，请稍后重试。"; });
      if (version !== requestVersion.current || controller.signal.aborted) return; if (streamError) throw new Error(streamError); if (!draft) throw new Error("AI 返回的人格格式不完整，请重新生成。"); onDraft(draft); setSuccess("人格草稿已生成，可以继续修改后保存。");
    } catch (caught) { if (version !== requestVersion.current) return; setError(controller.signal.aborted ? "生成已取消，现有内容未被修改。" : caught instanceof Error ? caught.message : "AI 人格生成失败，请稍后重试。"); }
    finally { if (version === requestVersion.current) { controllerRef.current = undefined; setLoading(false); } }
  }
  const visibleStages = repairingSeen ? stages : stages.filter((stage) => stage.id !== "repairing");
  return <section className="rounded-2xl border bg-card p-4 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></span><div><h2 className="font-semibold">AI 生成人格草稿</h2><p className="mt-1 text-sm text-muted-foreground">AI 只生成可编辑草稿；检查并点击保存前不会写入数据库。</p></div></div>{!configured && <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800">AI 人格生成服务尚未配置，你仍可切换到手动创建。</p>}<label className="mt-5 block text-sm font-medium" htmlFor="persona-ai-description">描述你希望创建的人格</label><textarea className="mt-2 min-h-32 w-full resize-y rounded-xl border bg-background p-3 text-sm" disabled={!configured || loading} id="persona-ai-description" maxLength={1500} onChange={(event) => setDescription(event.target.value)} placeholder="例如：帮我创建一个温和但严格的大学计算机老师……" value={description} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>10–1500 字符</span><span>{description.length}/1500</span></div><div className="mt-3 flex flex-wrap gap-2">{examples.map((example) => <button className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50" disabled={loading} key={example} onClick={() => setDescription(example)} type="button">{example.slice(0, 18)}…</button>)}</div>{loading && <div className="mt-4"><GenerationProgress activeStage={activeStage} elapsedSeconds={elapsed} onCancel={() => { requestVersion.current += 1; controllerRef.current?.abort(); controllerRef.current = undefined; setLoading(false); setError("生成已取消，现有内容未被修改。"); }} stages={visibleStages} title="正在生成人格草稿" /></div>}{error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}{success && <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{success}</p>}{!loading && <div className="mt-4"><Button disabled={!configured || description.trim().length < 10} onClick={() => void generate()} type="button"><Sparkles className="size-4" />{hasDraft ? "重新生成草稿" : "生成草稿"}</Button></div>}</section>;
}
