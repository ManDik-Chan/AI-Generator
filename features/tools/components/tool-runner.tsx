"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Square, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LANGUAGE_LABELS, TOOL_INPUT_MAX_CHARS, TOOL_LABELS } from "@/features/tools/constants";
import type { TextToolTypeValue, ToolRunState } from "@/features/tools/types";
import { readSseEvents } from "@/lib/ai/read-sse";
import { useGenerationRecovery } from "@/features/generation/use-generation-recovery";
import { requestDurableCancellation } from "@/features/generation/cancel-client";

const defaults = {
  SUMMARIZE: { length: "standard", format: "paragraph", language: "auto" },
  REWRITE: { style: "natural", intensity: "standard", preserveMarkdown: true, keepLength: false, explainChanges: false },
  TRANSLATE: { sourceLanguage: "auto", targetLanguage: "en", tone: "original", preserveMarkdown: true, preserveProperNouns: true, showOriginal: false },
} as const;

interface Props { tool: TextToolTypeValue; aiConfigured: boolean }

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="grid min-w-0 gap-1.5 text-sm"><span className="font-medium">{label}</span><select className="premium-field h-11 min-w-0 px-3" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="premium-subpanel flex min-h-11 items-center gap-2 px-3 py-2 text-sm"><input checked={checked} className="size-4 accent-[hsl(var(--primary))]" onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>;
}

export function ToolRunner({ tool, aiConfigured }: Props) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<Record<string, string | boolean>>({ ...defaults[tool] });
  const [saveHistory, setSaveHistory] = useState(true);
  const [output, setOutput] = useState("");
  const [state, setState] = useState<ToolRunState>("idle");
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [runId, setRunId] = useState<string>();
  const [startedAt, setStartedAt] = useState<number>();
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const mountedRef = useRef(true);
  const pendingCancelRef = useRef(false);
  const active = state === "submitting" || state === "streaming";
  const updateOption = (key: string, value: string | boolean) => setOptions((current) => ({ ...current, [key]: value }));
  const recover = useCallback((snapshot: { status: string; outputText?: string; errorCode?: string }) => {
    if (snapshot.outputText !== undefined) setOutput(snapshot.outputText);
    if (snapshot.status === "PENDING") setState("streaming");
    if (snapshot.status === "COMPLETE") { setState("complete"); setError(undefined); }
    if (snapshot.status === "CANCELLED") setState("stopped");
    if (snapshot.status === "ERROR") { setState("error"); setError("处理失败，请重试。"); }
  }, []);
  const recoveryPhase = useGenerationRecovery({
    storageKey: `ai-tool-run:${tool}`,
    runId,
    onRunId: setRunId,
    statusUrl: "/api/tools/runs/",
    statusSuffix: "?recovery=1",
    onSnapshot: recover,
  });

  async function confirmStop(id: string) {
    setCancelling(true);
    try {
      const status = await requestDurableCancellation(`/api/tools/runs/${id}/cancel`);
      if (status === "CANCELLED") {
        pendingCancelRef.current = false;
        controllerRef.current?.abort();
        setState("stopped");
        setError(undefined);
      } else {
        const response = await fetch(`/api/tools/runs/${id}?recovery=1`, { cache: "no-store" });
        if (!response.ok) throw new Error("停止请求未确认，任务可能仍在后台处理。");
        recover(await response.json() as { status: string; outputText?: string; errorCode?: string });
      }
    } catch (reason) {
      setState("streaming");
      setError(reason instanceof Error ? reason.message : "停止请求未确认，任务可能仍在后台处理。");
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    const raw = sessionStorage.getItem(`ai-tool-draft:${tool}`);
    if (raw) {
      try {
        const restored = JSON.parse(raw) as { input?: string; options?: Record<string, string | boolean> };
        if (restored.input) setInput(restored.input);
        if (restored.options) setOptions({ ...defaults[tool], ...restored.options });
      } catch { /* ignore invalid local drafts */ }
      sessionStorage.removeItem(`ai-tool-draft:${tool}`);
    }
    return () => { mountedRef.current = false; controllerRef.current?.abort(); };
  }, [tool]);

  useEffect(() => {
    if (!active || !startedAt) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  const statusText = useMemo(() => cancelling ? "正在请求停止" : state === "submitting" ? "正在准备" : state === "streaming" ? "正在生成" : state === "complete" ? "已完成" : state === "stopped" ? "已停止" : state === "error" ? "处理失败" : "等待输入", [cancelling, state]);

  async function run() {
    if (!input.trim() || active) return;
    if (!aiConfigured) { setError("AI 工具服务尚未配置，请联系管理员。"); setState("error"); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingCancelRef.current = false; setCancelling(false); setState("submitting"); setError(undefined); setOutput(""); setRunId(undefined); setElapsed(0); setStartedAt(Date.now());
    let terminalEvent = false;
    try {
      const response = await fetch("/api/tools/run", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ tool, input, options, saveHistory }), signal: controller.signal });
      await readSseEvents(response, (event, data) => {
        if (!mountedRef.current) return;
        const payload = data as Record<string, unknown>;
        if (event === "start") { const id = String(payload.runId); setRunId(id); setState("streaming"); if (pendingCancelRef.current) void confirmStop(id); }
        if (event === "delta") { setState("streaming"); setOutput((current) => current + String(payload.text ?? "")); }
        if (event === "done") { terminalEvent = true; setState("complete"); }
        if (event === "cancelled") { terminalEvent = true; setState("stopped"); }
        if (event === "error") { terminalEvent = true; if (payload.code === "CANCELLED") setState("stopped"); else { setState("error"); setError(String(payload.message ?? "处理失败，请重试。")); } }
      });
      if (!terminalEvent && !controller.signal.aborted) { setState("streaming"); setError("连接暂时中断，任务仍在后台处理。"); }
    } catch {
      if (!mountedRef.current) return;
      if (controller.signal.aborted) setState("stopped");
      else { setState("streaming"); setError("连接暂时中断，任务仍在后台处理。"); }
    } finally {
      if (mountedRef.current) controllerRef.current = undefined;
    }
  }

  async function stop() {
    if (cancelling) return;
    if (!runId) {
      pendingCancelRef.current = true;
      setCancelling(true);
      return;
    }
    await confirmStop(runId);
  }

  async function copy() { await navigator.clipboard.writeText(output); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  function download(extension: "txt" | "md") { const blob = new Blob([output], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${TOOL_LABELS[tool]}-${new Date().toISOString().slice(0, 10)}.${extension}`; link.click(); URL.revokeObjectURL(url); }

  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
    <section className="premium-panel min-w-0 p-4 sm:p-6">
      <div className="border-b border-border/10 pb-4"><p className="premium-kicker">INPUT & OPTIONS</p><label className="mt-1 block font-semibold" htmlFor="tool-input">原始文本</label></div>
      <textarea className="premium-field premium-scrollbar mt-4 min-h-64 resize-y p-4 text-sm leading-7" id="tool-input" maxLength={TOOL_INPUT_MAX_CHARS} onChange={(event) => setInput(event.target.value)} placeholder="粘贴或输入需要处理的文本……" value={input} />
      <p className="mt-1 text-right text-xs text-muted-foreground">{input.length} / {TOOL_INPUT_MAX_CHARS}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {tool === "SUMMARIZE" && <><SelectField label="摘要长度" onChange={(value) => updateOption("length", value)} value={String(options.length)}><option value="short">简短</option><option value="standard">标准</option><option value="detailed">详细</option></SelectField><SelectField label="输出形式" onChange={(value) => updateOption("format", value)} value={String(options.format)}><option value="paragraph">段落摘要</option><option value="bullets">要点列表</option><option value="study-notes">学习笔记</option></SelectField><SelectField label="输出语言" onChange={(value) => updateOption("language", value)} value={String(options.language)}><option value="auto">跟随原文</option><option value="zh-CN">简体中文</option><option value="en">English</option></SelectField></>}
        {tool === "REWRITE" && <><SelectField label="风格" onChange={(value) => updateOption("style", value)} value={String(options.style)}><option value="natural">自然流畅</option><option value="formal">正式专业</option><option value="concise">简洁直接</option><option value="friendly">友好口语</option><option value="academic">学术清晰</option></SelectField><SelectField label="改写强度" onChange={(value) => updateOption("intensity", value)} value={String(options.intensity)}><option value="light">轻度</option><option value="standard">标准</option><option value="deep">深度</option></SelectField><CheckField checked={Boolean(options.preserveMarkdown)} label="保留原有 Markdown" onChange={(value) => updateOption("preserveMarkdown", value)} /><CheckField checked={Boolean(options.keepLength)} label="尽量保持原长度" onChange={(value) => updateOption("keepLength", value)} /><CheckField checked={Boolean(options.explainChanges)} label="输出修改说明" onChange={(value) => updateOption("explainChanges", value)} /></>}
        {tool === "TRANSLATE" && <><SelectField label="源语言" onChange={(value) => updateOption("sourceLanguage", value)} value={String(options.sourceLanguage)}>{Object.entries(LANGUAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField><SelectField label="目标语言" onChange={(value) => updateOption("targetLanguage", value)} value={String(options.targetLanguage)}>{Object.entries(LANGUAGE_LABELS).filter(([value]) => value !== "auto").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField><SelectField label="语气" onChange={(value) => updateOption("tone", value)} value={String(options.tone)}><option value="original">保持原语气</option><option value="formal">正式</option><option value="natural">自然</option><option value="concise">简洁</option></SelectField><CheckField checked={Boolean(options.preserveMarkdown)} label="保留 Markdown" onChange={(value) => updateOption("preserveMarkdown", value)} /><CheckField checked={Boolean(options.preserveProperNouns)} label="保留专有名词" onChange={(value) => updateOption("preserveProperNouns", value)} /><CheckField checked={Boolean(options.showOriginal)} label="同时显示原文" onChange={(value) => updateOption("showOriginal", value)} /></>}
      </div>
      <label className="premium-subpanel mt-5 flex items-start gap-3 p-3 text-sm"><input checked={saveHistory} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" onChange={(event) => setSaveHistory(event.target.checked)} type="checkbox" /><span><strong>保存到工具历史</strong><span className="mt-1 block text-xs text-muted-foreground">关闭后，本次输入和结果不会保存在工具历史中。</span></span></label>
      {error && <p className="mt-4 rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground" role="alert">{error}</p>}
      {active && recoveryPhase === "background" && <p className="mt-3 text-xs text-muted-foreground">任务正在后台继续生成，返回前台后会自动恢复。</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/10 pt-4 max-[359px]:[&>button]:w-full">{active ? <Button disabled={cancelling} onClick={() => void stop()} type="button" variant="outline"><Square className="size-4" />{cancelling ? "正在请求停止" : "停止生成"}</Button> : <Button disabled={!input.trim()} onClick={() => void run()} type="button"><WandSparkles className="size-4" />开始处理</Button>}<span className="premium-chip max-w-full overflow-wrap-anywhere">{statusText}{startedAt ? ` · ${elapsed} 秒` : ""}</span></div>
    </section>
    <section className="premium-panel-strong min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/10 pb-4"><div className="min-w-0"><p className="premium-kicker">STREAMING RESULT</p><p className="mt-1 font-semibold">处理结果</p><p className="overflow-wrap-anywhere text-xs text-muted-foreground">{statusText} · 流式结果会显示在这里</p></div>{output && <div className="flex min-w-0 flex-wrap gap-2"><Button onClick={() => void copy()} size="sm" variant="outline">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "已复制" : "复制"}</Button><Button onClick={() => download("txt")} size="sm" variant="ghost"><Download className="size-3.5" />TXT</Button><Button onClick={() => download("md")} size="sm" variant="ghost"><Download className="size-3.5" />Markdown</Button></div>}</div>
      <div className="premium-result premium-scrollbar mt-4 min-h-[24rem] overflow-x-auto whitespace-pre-wrap break-words p-4 text-sm leading-7 sm:p-5">{output || <span className="grid min-h-[20rem] place-items-center text-center text-muted-foreground"><span><WandSparkles className="mx-auto size-7 text-primary/70" /><span className="mt-3 block text-sm font-medium text-foreground">结果将在这里展开</span><span className="mt-1 block text-xs">输入文本并选择选项后开始处理。</span></span></span>}</div>
    </section>
  </div>;
}
