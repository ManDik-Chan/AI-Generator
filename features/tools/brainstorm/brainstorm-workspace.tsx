"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, Clipboard, Copy, Download, Lightbulb, ListChecks, LoaderCircle, RotateCcw, Search, ShieldAlert, Square, Trash2 } from "lucide-react";

import { useElapsedTime, formatElapsedTime } from "@/components/ai/use-elapsed-time";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/features/chat/components/markdown-message";
import { requestDurableCancellation } from "@/features/generation/cancel-client";
import { useGenerationRecovery } from "@/features/generation/use-generation-recovery";
import { BRAINSTORM_PROMPT_MAX_CHARS, BRAINSTORM_WORKERS } from "@/features/tools/brainstorm/constants";
import type { BrainstormRecoveryDto, BrainstormUsageDto, BrainstormWorkerDto } from "@/features/tools/brainstorm/types";
import { formatBrainstormUsage } from "@/features/tools/brainstorm/usage-display";
import { readSseEvents } from "@/lib/ai/read-sse";

type RunState = "idle" | "running" | "complete" | "cancelled" | "error";

const icons = { ANALYST: Search, CREATIVE: Lightbulb, CRITIC: ShieldAlert, PLANNER: ListChecks } as const;
const storageKey = "ai-tool-run:BRAINSTORM";

function initialWorkers(): BrainstormWorkerDto[] {
  return BRAINSTORM_WORKERS.map((worker) => ({ role: worker.role, position: worker.position, label: worker.label, status: "PENDING", output: "" }));
}

function workerStatus(status: BrainstormWorkerDto["status"], active: boolean) {
  if (status === "COMPLETE") return "已完成";
  if (status === "ERROR") return "失败";
  if (status === "CANCELLED") return "已停止";
  return active ? "正在思考" : "等待开始";
}

function statusClass(status: BrainstormWorkerDto["status"], active: boolean) {
  if (status === "COMPLETE") return "border-success/15 bg-success-subtle text-success-foreground";
  if (status === "ERROR") return "border-destructive/15 bg-destructive-subtle text-destructive-foreground";
  if (status === "CANCELLED") return "border-warning/15 bg-warning-subtle text-warning-foreground";
  return active ? "border-primary/15 bg-primary-subtle text-primary-subtle-foreground" : "";
}

export function BrainstormWorkspace({ configured, initialUsage }: { configured: boolean; initialUsage: BrainstormUsageDto }) {
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const requestVersionRef = useRef(0);
  const pendingCancelRef = useRef(false);
  const observerConnectedRef = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [saveHistory, setSaveHistory] = useState(true);
  const [usage, setUsage] = useState(initialUsage);
  const [workers, setWorkers] = useState<BrainstormWorkerDto[]>(initialWorkers);
  const [output, setOutput] = useState("");
  const [state, setState] = useState<RunState>("idle");
  const [runId, setRunId] = useState<string>();
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const elapsed = useElapsedTime(state === "running");

  const updateWorker = useCallback((role: BrainstormWorkerDto["role"], patch: Partial<BrainstormWorkerDto>) => {
    setWorkers((current) => current.map((worker) => worker.role === role ? { ...worker, ...patch } : worker));
  }, []);

  const recover = useCallback((snapshot: BrainstormRecoveryDto) => {
    setUsage(snapshot.usage);
    if (snapshot.status === "PENDING" && observerConnectedRef.current) return;
    setWorkers(snapshot.workers);
    setOutput(snapshot.outputText);
    if (snapshot.prompt) setPrompt(snapshot.prompt);
    if (snapshot.status === "PENDING") { setState("running"); setError("连接暂时中断，任务仍在后台处理。"); }
    if (snapshot.status === "COMPLETE") { setState("complete"); setError(""); }
    if (snapshot.status === "CANCELLED") { setState("cancelled"); setError("头脑风暴已停止；已完成的 Worker 内容仍会保留到隐私恢复期结束。"); }
    if (snapshot.status === "ERROR") { setState("error"); setError(snapshot.errorCode === "INSUFFICIENT_WORKERS" ? "成功完成的 Worker 少于两个，未调用协调器。" : "头脑风暴失败；已完成的 Worker 结果仍可查看。"); }
  }, []);

  const recoveryPhase = useGenerationRecovery({ storageKey, runId, onRunId: setRunId, statusUrl: "/api/tools/runs/", statusSuffix: "?recovery=1", onSnapshot: recover });

  useEffect(() => {
    const raw = sessionStorage.getItem("ai-tool-draft:BRAINSTORM");
    if (raw) {
      try {
        const draft = JSON.parse(raw) as { input?: string };
        if (draft.input) setPrompt(draft.input.slice(0, BRAINSTORM_PROMPT_MAX_CHARS));
      } catch { /* ignore malformed local draft */ }
      sessionStorage.removeItem("ai-tool-draft:BRAINSTORM");
    }
    return () => { requestVersionRef.current += 1; controllerRef.current?.abort(); };
  }, []);

  async function confirmStop(id: string) {
    setCancelling(true);
    try {
      const status = await requestDurableCancellation(`/api/tools/runs/${id}/cancel`);
      if (status !== "CANCELLED") throw new Error("停止请求尚未确认，任务可能仍在后台处理。");
      pendingCancelRef.current = false;
      requestVersionRef.current += 1;
      controllerRef.current?.abort();
      setWorkers((current) => current.map((worker) => worker.status === "PENDING" ? { ...worker, status: "CANCELLED" } : worker));
      setState("cancelled");
      setError("头脑风暴已停止。");
    } catch (reason) {
      setState("running");
      setError(reason instanceof Error ? reason.message : "停止请求尚未确认，任务可能仍在后台处理。");
    } finally { setCancelling(false); }
  }

  async function start() {
    const cleanPrompt = prompt.trim();
    if (!configured || !cleanPrompt || state === "running") return;
    const version = ++requestVersionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingCancelRef.current = false;
    setRunId(undefined);
    sessionStorage.removeItem(storageKey);
    setWorkers(initialWorkers());
    setOutput("");
    setError("");
    setState("running");
    let createdRunId: string | undefined;
    try {
      let terminal = false;
      const response = await fetch("/api/tools/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, saveHistory }),
        signal: controller.signal,
      });
      await readSseEvents(response, (event, raw) => {
        if (version !== requestVersionRef.current) return;
        if (event === "run") {
          const data = raw as { runId: string; usage: BrainstormUsageDto };
          createdRunId = data.runId;
          observerConnectedRef.current = true;
          setRunId(data.runId);
          setUsage(data.usage);
          if (pendingCancelRef.current) void confirmStop(data.runId);
        }
        if (event === "worker_started") {
          const data = raw as { role: BrainstormWorkerDto["role"] };
          updateWorker(data.role, { status: "PENDING", startedAt: new Date().toISOString() });
        }
        if (event === "worker_done") {
          const data = raw as { role: BrainstormWorkerDto["role"]; output: string };
          updateWorker(data.role, { status: "COMPLETE", output: data.output, completedAt: new Date().toISOString() });
        }
        if (event === "worker_error") {
          const data = raw as { role: BrainstormWorkerDto["role"]; code: string };
          updateWorker(data.role, { status: data.code === "CANCELLED" ? "CANCELLED" : "ERROR", errorCode: data.code, completedAt: new Date().toISOString() });
        }
        if (event === "synthesis_delta") setOutput((current) => current + (raw as { text: string }).text);
        if (event === "done") { terminal = true; setState("complete"); setError(""); }
        if (event === "cancelled") { terminal = true; setState("cancelled"); setError("头脑风暴已停止。"); }
        if (event === "error") { terminal = true; setState("error"); setError((raw as { message?: string }).message || "头脑风暴失败；已完成的 Worker 结果仍可查看。"); }
      });
      observerConnectedRef.current = false;
      if (!terminal && version === requestVersionRef.current) { setState("running"); setError("连接暂时中断，任务仍在后台处理。"); }
    } catch (reason) {
      observerConnectedRef.current = false;
      if (version !== requestVersionRef.current) return;
      if (!controller.signal.aborted && createdRunId) { setState("running"); setError("连接暂时中断，任务仍在后台处理。"); }
      if (!controller.signal.aborted && !createdRunId) { pendingCancelRef.current = false; setCancelling(false); setState("error"); setError(reason instanceof Error ? reason.message : "无法创建头脑风暴任务，请稍后重试。"); }
    } finally {
      if (version === requestVersionRef.current) controllerRef.current = undefined;
    }
  }

  async function stop() {
    if (state !== "running" || cancelling) return;
    if (!runId) { pendingCancelRef.current = true; setCancelling(true); return; }
    await confirmStop(runId);
  }

  async function remove() {
    if (!runId || !window.confirm("确定删除这次头脑风暴吗？四个 Worker 和综合结果会一并删除。")) return;
    const response = await fetch(`/api/tools/runs/${runId}`, { method: "DELETE" });
    if (!response.ok) { setError("删除失败，请稍后重试。"); return; }
    sessionStorage.removeItem(storageKey);
    setRunId(undefined); setState("idle"); setWorkers(initialWorkers()); setOutput(""); setError("");
  }

  function reuse() {
    sessionStorage.removeItem(storageKey);
    setRunId(undefined); setState("idle"); setWorkers(initialWorkers()); setOutput(""); setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function download(extension: "txt" | "md") {
    const workerText = workers.map((worker) => `## ${worker.label}\n\n${worker.output || "无输出"}`).join("\n\n");
    const content = `# 多 Agent 头脑风暴\n\n## 问题\n\n${prompt}\n\n${workerText}\n\n## 综合结论\n\n${output || "无综合结论"}`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `多-Agent-头脑风暴-${new Date().toISOString().slice(0, 10)}.${extension}`; anchor.click(); URL.revokeObjectURL(url);
  }

  const active = state === "running";
  const recoveryMessage = recoveryPhase === "checking" ? "正在恢复状态" : recoveryPhase === "long-running" ? "任务仍在处理，可稍后回来查看" : recoveryPhase === "background" ? "任务正在后台继续生成" : "";

  return <div className="min-w-0 space-y-8">
    <section className="premium-panel min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/10 pb-4"><div><p className="premium-kicker">ONE QUESTION · FIVE CALLS MAX</p><h2 className="mt-1 text-section-title">输入需要并行思考的问题</h2></div><span className="premium-chip">{formatBrainstormUsage(usage)}</span></div>
      <label className="mt-5 grid gap-2"><span className="text-sm font-medium">问题</span><textarea className="premium-field min-h-40 resize-y p-3 leading-6" disabled={active || !configured} maxLength={BRAINSTORM_PROMPT_MAX_CHARS} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：我们应该如何在三个月内验证一个面向独立开发者的 AI 产品方向？" value={prompt} /><span className="text-right text-xs text-muted-foreground">{prompt.length} / {BRAINSTORM_PROMPT_MAX_CHARS}</span></label>
      <label className="premium-subpanel mt-4 flex items-start gap-3 p-3 text-sm"><input checked={saveHistory} className="mt-0.5 size-4 accent-[hsl(var(--primary))]" disabled={active} onChange={(event) => setSaveHistory(event.target.checked)} type="checkbox" /><span><strong>保存到头脑风暴历史</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">关闭后仅在短期恢复窗口保留问题和结果，到期自动清理正文。</span></span></label>
      {!configured && <p className="mt-4 rounded-control bg-warning-subtle p-3 text-sm text-warning-foreground">多 Agent 头脑风暴服务尚未配置，请联系管理员。</p>}
      {error && <p className="mt-4 rounded-control bg-warning-subtle p-3 text-sm text-warning-foreground" role="status">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/10 pt-4"><div className="flex min-w-0 flex-wrap gap-2 max-[359px]:w-full max-[359px]:[&>button]:w-full">{active ? <Button disabled={cancelling} onClick={() => void stop()} variant="outline"><Square className="size-4 fill-current" />{cancelling ? "正在请求停止" : "停止头脑风暴"}</Button> : <Button disabled={!configured || !prompt.trim()} onClick={() => void start()}><BrainCircuit className="size-4" />开始头脑风暴</Button>}{state !== "idle" && !active ? <Button onClick={reuse} variant="outline"><RotateCcw className="size-4" />再次头脑风暴</Button> : null}</div><div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">{active && <span>{formatElapsedTime(elapsed)}</span>}{recoveryMessage && <span className="premium-chip max-w-full overflow-wrap-anywhere"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />{recoveryMessage}</span>}</div></div>
    </section>

    <section><div><p className="premium-kicker">INDEPENDENT WORKERS</p><h2 className="mt-1 text-section-title">四个 Worker</h2><p className="mt-1 text-supporting">四个角色独立调用，单个失败不会阻止其他角色继续。</p></div><div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">{workers.map((worker) => { const Icon = icons[worker.role]; const running = active && worker.status === "PENDING" && Boolean(worker.startedAt); return <article className="premium-panel flex min-h-64 min-w-0 flex-col p-4 sm:p-5" key={worker.role}><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="premium-icon-tile size-11 shrink-0"><Icon className="size-5" /></span><div className="min-w-0"><p className="font-semibold">{worker.label}</p><p className="mt-1 overflow-wrap-anywhere text-xs text-muted-foreground">{BRAINSTORM_WORKERS.find((item) => item.role === worker.role)?.purpose}</p></div></div><span className={`premium-chip shrink-0 ${statusClass(worker.status, running)}`}>{workerStatus(worker.status, running)}</span></div><div className="premium-result premium-scrollbar mt-4 max-h-[28rem] min-h-36 flex-1 overflow-y-auto p-4">{worker.output ? <MarkdownMessage content={worker.output} /> : worker.status === "ERROR" ? <p className="text-sm text-destructive-foreground">该 Worker 运行失败，没有可展示的输出。</p> : <p className="text-sm text-muted-foreground">{running ? "正在独立分析…" : active ? "等待可用并发位置…" : "运行后将在这里显示真实输出。"}</p>}</div>{worker.output && <Button className="mt-3 self-start" onClick={() => void navigator.clipboard.writeText(worker.output)} size="sm" variant="ghost"><Copy className="size-3.5" />复制</Button>}</article>; })}</div></section>

    <section className="premium-panel-strong min-w-0 p-4 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/10 pb-4"><div><p className="premium-kicker">COORDINATED SYNTHESIS</p><h2 className="mt-1 text-section-title">综合结论</h2></div>{active && output ? <span className="premium-chip"><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />协调器正在综合</span> : null}</div><div className="premium-result premium-scrollbar mt-4 min-h-64 overflow-x-auto p-4 sm:p-6">{output ? <MarkdownMessage content={output} /> : <div className="grid min-h-52 place-items-center text-center text-sm text-muted-foreground"><span><Clipboard className="mx-auto size-7" /><span className="mt-3 block">至少两个 Worker 成功后，协调器才会生成综合结论。</span></span></div>}</div>{output && <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => void navigator.clipboard.writeText(output)} variant="outline"><Copy className="size-4" />复制综合结果</Button><Button onClick={() => download("txt")} variant="ghost"><Download className="size-4" />TXT</Button><Button onClick={() => download("md")} variant="ghost"><Download className="size-4" />Markdown</Button>{runId && !active ? <Button className="text-destructive-foreground" onClick={() => void remove()} variant="ghost"><Trash2 className="size-4" />删除记录</Button> : null}</div>}
    </section>
  </div>;
}
