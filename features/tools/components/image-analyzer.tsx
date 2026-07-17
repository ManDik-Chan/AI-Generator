"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ImagePlus, ShieldCheck, Square, Trash2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { readSseEvents } from "@/lib/ai/read-sse";
import type { ToolRunState } from "@/features/tools/types";
import { formatVisionUsage } from "@/features/tools/image/usage-display";
import { useGenerationRecovery } from "@/features/generation/use-generation-recovery";
import { requestDurableCancellation } from "@/features/generation/cancel-client";

interface Props { configured: boolean; initialRemaining: number; initialLimit: number; initialUsed: number; initialUnlimited: boolean }
const defaults = { mode: "general", detail: "standard", language: "auto" };

export function ImageAnalyzer({ configured, initialRemaining, initialLimit, initialUsed, initialUnlimited }: Props) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [sourceAssetId, setSourceAssetId] = useState<string>();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(defaults);
  const [saveHistory, setSaveHistory] = useState(true);
  const [output, setOutput] = useState("");
  const [state, setState] = useState<ToolRunState>("idle");
  const [error, setError] = useState<string>();
  const [runId, setRunId] = useState<string>();
  const [usage, setUsage] = useState({ limit: initialLimit, used: initialUsed, remaining: initialRemaining, unlimited: initialUnlimited });
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const pendingCancelRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = state === "submitting" || state === "streaming";
  const recover = useCallback((snapshot: { status: string; outputText?: string }) => {
    if (snapshot.outputText !== undefined) setOutput(snapshot.outputText);
    if (snapshot.status === "PENDING") setState("streaming");
    if (snapshot.status === "COMPLETE") { setState("complete"); setError(undefined); }
    if (snapshot.status === "CANCELLED") setState("stopped");
    if (snapshot.status === "ERROR") { setState("error"); setError("图片分析失败，请重试。"); }
  }, []);
  useGenerationRecovery({ storageKey: "ai-tool-run:IMAGE_ANALYZE", runId, onRunId: setRunId, statusUrl: "/api/tools/runs/", statusSuffix: "?recovery=1", onSnapshot: recover });

  async function confirmStop(id: string) {
    setCancelling(true);
    try {
      const status = await requestDurableCancellation(`/api/tools/runs/${id}/cancel`);
      if (status === "CANCELLED") {
        pendingCancelRef.current = false; controllerRef.current?.abort(); setState("stopped"); setError(undefined);
      } else {
        const response = await fetch(`/api/tools/runs/${id}?recovery=1`, { cache: "no-store" });
        if (!response.ok) throw new Error("停止请求未确认，任务可能仍在后台处理。");
        recover(await response.json() as { status: string; outputText?: string });
      }
    } catch (reason) {
      setState("streaming");
      setError(reason instanceof Error ? reason.message : "停止请求未确认，任务可能仍在后台处理。");
    } finally { setCancelling(false); }
  }

  useEffect(() => {
    const raw = sessionStorage.getItem("ai-tool-draft:IMAGE_ANALYZE");
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as { input?: string; options?: typeof defaults; assetId?: string };
      setQuestion(draft.input || "");
      if (draft.options) setOptions({ ...defaults, ...draft.options });
      if (draft.assetId) { setSourceAssetId(draft.assetId); setPreview(`/api/tools/assets/${draft.assetId}`); }
    } catch { /* invalid local draft */ }
    sessionStorage.removeItem("ai-tool-draft:IMAGE_ANALYZE");
  }, []);
  useEffect(() => () => { controllerRef.current?.abort(); if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  function choose(next?: File) { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); setFile(next); setSourceAssetId(undefined); setPreview(next ? URL.createObjectURL(next) : undefined); setError(undefined); }
  function update(key: keyof typeof defaults, value: string) { setOptions((current) => ({ ...current, [key]: value })); }

  async function run() {
    if ((!file && !sourceAssetId) || active) return;
    if (!configured) { setError("图片分析服务尚未配置，请联系管理员。"); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingCancelRef.current = false; setCancelling(false); setState("submitting"); setOutput(""); setError(undefined); setRunId(undefined);
    const form = new FormData();
    if (file) form.set("image", file);
    if (sourceAssetId) form.set("sourceAssetId", sourceAssetId);
    form.set("question", question); form.set("options", JSON.stringify(options)); form.set("saveHistory", String(saveHistory));
    let terminal = false;
    try {
      const response = await fetch("/api/tools/image/run", { method: "POST", body: form, signal: controller.signal });
      await readSseEvents(response, (event, data) => {
        const payload = data as Record<string, unknown>;
        if (event === "start") { const id = String(payload.runId); setRunId(id); setUsage({ limit: Number(payload.limit), used: Number(payload.used), remaining: Number(payload.remaining), unlimited: payload.unlimited === true }); setState("streaming"); if (pendingCancelRef.current) void confirmStop(id); }
        if (event === "delta") { setState("streaming"); setOutput((current) => current + String(payload.text || "")); }
        if (event === "done") { terminal = true; setState("complete"); }
        if (event === "cancelled") { terminal = true; setState("stopped"); }
        if (event === "error") { terminal = true; if (payload.code === "CANCELLED") setState("stopped"); else { setState("error"); setError(String(payload.message || "图片分析失败，请重试。")); } }
      });
      if (!terminal && !controller.signal.aborted) { setState("streaming"); setError("连接暂时中断，任务仍在后台处理。"); }
    } catch {
      if (controller.signal.aborted) setState("stopped");
      else { setState("streaming"); setError("连接暂时中断，任务仍在后台处理。"); }
    } finally { controllerRef.current = undefined; }
  }

  async function stop() { if (cancelling) return; if (!runId) { pendingCancelRef.current = true; setCancelling(true); return; } await confirmStop(runId); }
  function download(extension: "txt" | "md") { const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `图片分析-${new Date().toISOString().slice(0, 10)}.${extension}`; anchor.click(); URL.revokeObjectURL(url); }

  const statusLabel = cancelling ? "正在请求停止" : state === "streaming" ? "正在流式分析" : state === "submitting" ? "正在安全处理图片" : state === "stopped" ? "已停止，部分结果已保留" : state === "complete" ? "分析完成" : state === "error" ? "分析失败" : "等待图片";

  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
    <section className="premium-panel min-w-0 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 border-b border-border/10 pb-4"><div><p className="premium-kicker">PRIVATE UPLOAD</p><p className="mt-1 font-semibold">上传图片</p></div><p className="premium-chip text-right">{formatVisionUsage(usage)}</p></div>
      {preview ? <div className="mt-4"><div className="premium-result relative aspect-video overflow-hidden"><span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">原图片已到期或暂时不可用，请重新选择。</span><Image alt="待分析图片预览" className="z-10 bg-surface-muted object-contain" fill onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} src={preview} unoptimized /></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 truncate text-xs text-muted-foreground">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "来自私有工具历史的图片"}</p><Button disabled={active} onClick={() => choose()} size="sm" variant="ghost"><Trash2 className="size-4" />删除并重新选择</Button></div></div> : <button aria-label="选择图片" className="surface-grid group mt-4 grid min-h-60 w-full place-items-center overflow-hidden rounded-card border border-primary/16 bg-gradient-to-br from-primary-subtle/75 to-surface-raised p-6 text-center transition hover:border-primary/35 hover:shadow-raised" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }} type="button"><span><span className="premium-icon-tile mx-auto size-16 rounded-[1.3rem] shadow-soft transition-transform group-hover:-translate-y-1"><ImagePlus className="size-7" /></span><strong className="mt-4 block text-base">拖放图片，或点击选择</strong><span className="mt-2 block text-xs leading-5 text-muted-foreground">PNG、JPEG、WebP · 单张不超过 10 MB<br />选择后不会自动产生模型费用</span></span></button>}
      <input accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => choose(event.target.files?.[0])} ref={inputRef} type="file" />
      <label className="mt-5 grid gap-1.5 text-sm"><span className="font-medium">你想了解什么（可选）</span><textarea className="premium-field min-h-24 p-3 leading-6" maxLength={2000} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：这个界面有哪些可用性问题？" value={question} /></label>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><Select label="分析模式" value={options.mode} onChange={(value) => update("mode", value)}><option value="general">通用描述</option><option value="detailed">详细分析</option><option value="question">针对问题回答</option></Select><Select label="详细程度" value={options.detail} onChange={(value) => update("detail", value)}><option value="short">简短</option><option value="standard">标准</option><option value="detailed">详细</option></Select><Select label="输出语言" value={options.language} onChange={(value) => update("language", value)}><option value="auto">自动</option><option value="zh-CN">中文</option><option value="en">English</option></Select></div>
      <label className="premium-subpanel mt-4 flex items-start gap-3 p-3 text-sm"><input checked={saveHistory} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" onChange={(event) => setSaveHistory(event.target.checked)} type="checkbox" /><span><strong>保存到工具历史</strong><span className="mt-1 block text-xs text-muted-foreground">图片为私有资源，默认保留 7 天；关闭后终态立即清理。</span></span></label>
      {error && <p className="mt-4 rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground" role="alert">{error}</p>}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/10 pt-4">{active ? <Button disabled={cancelling} onClick={() => void stop()} variant="outline"><Square className="size-4" />{cancelling ? "正在请求停止" : "停止分析"}</Button> : <Button disabled={!preview || (options.mode === "question" && !question.trim())} onClick={() => void run()}><WandSparkles className="size-4" />开始分析</Button>}<span className="premium-chip">{statusLabel}</span></div>
    </section>
    <section className="premium-panel-strong min-w-0 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/10 pb-4"><div><p className="premium-kicker">VISION RESULT</p><p className="mt-1 font-semibold">分析结果</p><p className="text-xs text-muted-foreground">{statusLabel}</p></div>{output && <div className="flex flex-wrap gap-2"><Button onClick={async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1500); }} size="sm" variant="outline">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "已复制" : "复制"}</Button><Button onClick={() => download("txt")} size="sm" variant="ghost"><Download className="size-4" />TXT</Button><Button onClick={() => download("md")} size="sm" variant="ghost"><Download className="size-4" />Markdown</Button></div>}</div><div className="premium-result premium-scrollbar mt-4 min-h-[24rem] whitespace-pre-wrap break-words p-4 text-sm leading-7 sm:p-5">{output || <span className="grid min-h-[20rem] place-items-center text-center text-muted-foreground"><span><ShieldCheck className="mx-auto size-8 text-primary/70" /><span className="mt-3 block font-medium text-foreground">安全分析结果将在这里显示</span><span className="mt-1 block text-xs">上传图片不会自动产生调用。</span></span></span>}</div></section>
  </div>;
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange(value: string): void; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm"><span className="font-medium">{label}</span><select className="premium-field h-11 min-w-0 px-3" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}
