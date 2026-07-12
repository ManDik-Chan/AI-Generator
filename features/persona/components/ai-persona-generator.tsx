"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PersonaInput } from "@/features/persona/types";

export interface GeneratedPersonaClientDraft extends PersonaInput { avatarPrompt: string; avatarPresetId: string }

const examples = [
  "温和但严格的大学计算机老师，擅长网络和数据库，先给结论再给考试速记。",
  "冷静可靠的职业规划顾问，善于提出具体问题，回答简洁且不夸大承诺。",
  "充满想象力的科幻小说编辑，重视人物动机、节奏和世界观一致性。",
];

export function AiPersonaGenerator({ configured, hasDraft, onDraft }: { configured: boolean; hasDraft: boolean; onDraft(draft: GeneratedPersonaClientDraft): void }) {
  const [description, setDescription] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState<string>(); const controllerRef = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function generate() {
    if (hasDraft && !window.confirm("重新生成会覆盖当前未保存的人格内容，是否继续？")) return;
    const content = description.trim(); if (content.length < 10 || content.length > 1500 || loading) return;
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller; setLoading(true); setError(undefined);
    try {
      const response = await fetch("/api/personas/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: content }), signal: controller.signal });
      const body = await response.json().catch(() => null) as { draft?: GeneratedPersonaClientDraft; message?: string } | null;
      if (!response.ok || !body?.draft) throw new Error(body?.message || "AI 返回的人格格式不完整，请重新生成。");
      onDraft(body.draft);
    } catch (caught) { if (controller.signal.aborted) setError("生成已取消，现有内容未被修改。"); else setError(caught instanceof Error ? caught.message : "AI 人格生成失败，请稍后重试。"); }
    finally { if (controllerRef.current === controller) controllerRef.current = undefined; setLoading(false); }
  }

  return <section className="rounded-2xl border bg-card p-4 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></span><div><h2 className="font-semibold">AI 生成人格草稿</h2><p className="mt-1 text-sm text-muted-foreground">AI 只生成可编辑草稿；检查并点击保存前不会写入数据库。</p></div></div>{!configured && <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800">AI 人格生成服务尚未配置，你仍可切换到手动创建。</p>}<label className="mt-5 block text-sm font-medium" htmlFor="persona-ai-description">描述你希望创建的人格</label><textarea aria-describedby={error ? "persona-ai-error" : "persona-ai-help"} className="mt-2 min-h-32 w-full resize-y rounded-xl border bg-background p-3 text-sm" disabled={!configured || loading} id="persona-ai-description" maxLength={1500} onChange={(event) => setDescription(event.target.value)} placeholder="例如：帮我创建一个温和但严格的大学计算机老师……" value={description} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span id="persona-ai-help">10–1500 字符</span><span>{description.length}/1500</span></div><div className="mt-3 flex flex-wrap gap-2">{examples.map((example) => <button className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50" disabled={loading} key={example} onClick={() => setDescription(example)} type="button">{example.slice(0, 18)}…</button>)}</div>{error && <p className="mt-3 text-sm text-red-600" id="persona-ai-error" role="alert">{error}</p>}<div className="mt-4 flex flex-wrap gap-2">{loading ? <Button onClick={() => controllerRef.current?.abort()} type="button" variant="outline"><Square className="size-4" />取消生成</Button> : <Button disabled={!configured || description.trim().length < 10} onClick={() => void generate()} type="button"><Sparkles className="size-4" />{hasDraft ? "重新生成草稿" : "生成草稿"}</Button>}</div></section>;
}
