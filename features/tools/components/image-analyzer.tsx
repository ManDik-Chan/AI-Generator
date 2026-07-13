"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ImagePlus, Square, Trash2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { readSseEvents } from "@/lib/ai/read-sse";
import type { ToolRunState } from "@/features/tools/types";

interface Props { configured: boolean; initialRemaining: number; initialLimit: number }
const defaults = { mode: "general", detail: "standard", language: "auto" };

export function ImageAnalyzer({ configured, initialRemaining, initialLimit }: Props) {
  const [file, setFile] = useState<File>(); const [preview, setPreview] = useState<string>(); const [sourceAssetId, setSourceAssetId] = useState<string>();
  const [question, setQuestion] = useState(""); const [options, setOptions] = useState(defaults); const [saveHistory, setSaveHistory] = useState(true);
  const [output, setOutput] = useState(""); const [state, setState] = useState<ToolRunState>("idle"); const [error, setError] = useState<string>();
  const [runId, setRunId] = useState<string>(); const [remaining, setRemaining] = useState(initialRemaining); const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | undefined>(undefined); const inputRef = useRef<HTMLInputElement>(null); const active = state === "submitting" || state === "streaming";

  useEffect(() => { const raw = sessionStorage.getItem("ai-tool-draft:IMAGE_ANALYZE"); if (!raw) return; try { const draft = JSON.parse(raw) as { input?: string; options?: typeof defaults; assetId?: string }; setQuestion(draft.input || ""); if (draft.options) setOptions({ ...defaults, ...draft.options }); if (draft.assetId) { setSourceAssetId(draft.assetId); setPreview(`/api/tools/assets/${draft.assetId}`); } } catch { /* invalid local draft */ } sessionStorage.removeItem("ai-tool-draft:IMAGE_ANALYZE"); }, []);
  useEffect(() => () => { controllerRef.current?.abort(); if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  function choose(next?: File) { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); setFile(next); setSourceAssetId(undefined); setPreview(next ? URL.createObjectURL(next) : undefined); setError(undefined); }
  function update(key: keyof typeof defaults, value: string) { setOptions((current) => ({ ...current, [key]: value })); }
  async function run() {
    if ((!file && !sourceAssetId) || active) return; if (!configured) { setError("图片分析服务尚未配置，请联系管理员。"); return; }
    const controller = new AbortController(); controllerRef.current = controller; setState("submitting"); setOutput(""); setError(undefined); setRunId(undefined);
    const form = new FormData(); if (file) form.set("image", file); if (sourceAssetId) form.set("sourceAssetId", sourceAssetId); form.set("question", question); form.set("options", JSON.stringify(options)); form.set("saveHistory", String(saveHistory));
    let terminal = false;
    try {
      const response = await fetch("/api/tools/image/run", { method: "POST", body: form, signal: controller.signal });
      await readSseEvents(response, (event, data) => { const payload = data as Record<string, unknown>; if (event === "start") { setRunId(String(payload.runId)); setRemaining(Number(payload.remaining)); setState("streaming"); } if (event === "delta") { setState("streaming"); setOutput((current) => current + String(payload.text || "")); } if (event === "done") { terminal = true; setState("complete"); } if (event === "error") { terminal = true; if (payload.code === "CANCELLED") setState("stopped"); else { setState("error"); setError(String(payload.message || "图片分析失败，请重试。")); } } });
      if (!terminal && !controller.signal.aborted) { setState("error"); setError("连接提前结束，请重试。"); }
    } catch (caught) { if (controller.signal.aborted) setState("stopped"); else { setState("error"); setError(caught instanceof Error ? caught.message : "图片分析失败，请重试。"); } }
    finally { controllerRef.current = undefined; }
  }
  function stop() { if (runId) void fetch(`/api/tools/runs/${runId}/cancel`, { method: "POST", keepalive: true }); controllerRef.current?.abort(); setState("stopped"); }
  function download(extension: "txt" | "md") { const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `图片分析-${new Date().toISOString().slice(0,10)}.${extension}`; anchor.click(); URL.revokeObjectURL(url); }

  return <div className="grid min-w-0 gap-5 lg:grid-cols-2">
    <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-soft sm:p-6">
      <div className="flex items-center justify-between gap-3"><p className="font-medium">上传图片</p><p className="text-xs text-muted-foreground">今日剩余 {remaining} / {initialLimit}</p></div>
      {preview ? <div className="mt-3"><div className="relative aspect-video overflow-hidden rounded-xl border bg-muted"><span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">图片暂时不可用，请重新选择。</span><Image alt="待分析图片预览" className="z-10 bg-muted object-contain" fill onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} src={preview} unoptimized /></div><Button className="mt-2" disabled={active} onClick={() => choose()} size="sm" variant="ghost"><Trash2 className="size-4" />删除并重新选择</Button></div> : <button aria-label="选择图片" className="mt-3 grid min-h-52 w-full place-items-center rounded-xl border border-dashed p-6 text-center hover:bg-muted/50" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }} type="button"><span><ImagePlus className="mx-auto size-8 text-primary" /><strong className="mt-3 block">拖放或点击上传</strong><span className="mt-1 block text-xs text-muted-foreground">PNG、JPEG、WebP，单张不超过 10 MB</span></span></button>}
      <input accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => choose(event.target.files?.[0])} ref={inputRef} type="file" />
      <label className="mt-4 grid gap-1.5 text-sm"><span className="font-medium">你想了解什么（可选）</span><textarea className="min-h-24 rounded-xl border bg-background p-3" maxLength={2000} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：这个界面有哪些可用性问题？" value={question} /></label>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Select label="分析模式" value={options.mode} onChange={(value) => update("mode", value)}><option value="general">通用描述</option><option value="detailed">详细分析</option><option value="question">针对问题回答</option></Select><Select label="详细程度" value={options.detail} onChange={(value) => update("detail", value)}><option value="short">简短</option><option value="standard">标准</option><option value="detailed">详细</option></Select><Select label="输出语言" value={options.language} onChange={(value) => update("language", value)}><option value="auto">自动</option><option value="zh-CN">中文</option><option value="en">English</option></Select></div>
      <label className="mt-4 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"><input checked={saveHistory} className="mt-0.5 size-4" onChange={(event) => setSaveHistory(event.target.checked)} type="checkbox" /><span><strong>保存到工具历史</strong><span className="mt-1 block text-xs text-muted-foreground">图片为私有资源，默认保留 7 天；关闭后终态立即清理。</span></span></label>
      {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="mt-5">{active ? <Button onClick={stop} variant="outline"><Square className="size-4" />停止分析</Button> : <Button disabled={!preview || (options.mode === "question" && !question.trim())} onClick={() => void run()}><WandSparkles className="size-4" />开始分析</Button>}</div>
    </section>
    <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-soft sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">分析结果</p><p className="text-xs text-muted-foreground">{state === "streaming" ? "正在流式分析" : state === "stopped" ? "已停止，部分结果已保留" : "结果会显示在这里"}</p></div>{output && <div className="flex flex-wrap gap-2"><Button onClick={async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); }} size="sm" variant="outline">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "已复制" : "复制"}</Button><Button onClick={() => download("txt")} size="sm" variant="ghost"><Download className="size-4" />TXT</Button><Button onClick={() => download("md")} size="sm" variant="ghost"><Download className="size-4" />Markdown</Button></div>}</div><div className="mt-4 min-h-64 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-4 text-sm leading-7">{output || <span className="text-muted-foreground">尚无结果。上传图片不会自动产生调用。</span>}</div></section>
  </div>;
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange(value: string): void; children: React.ReactNode }) { return <label className="grid min-w-0 gap-1.5 text-sm"><span className="font-medium">{label}</span><select className="h-11 min-w-0 rounded-xl border bg-background px-3" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>; }
