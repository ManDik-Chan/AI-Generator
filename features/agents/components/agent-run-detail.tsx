"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquareText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AgentWorkerPanel } from "@/features/agents/components/agent-worker-panel";
import type { AgentRunView } from "@/features/agents/client-types";
import { agentModeLabels, agentRunStatusLabels, getAgentRunProgressLabel } from "@/features/agents/presentation";

interface AgentRunDetailProps { initialRun: AgentRunView }

export function AgentRunDetail({ initialRun }: AgentRunDetailProps) {
  const [run, setRun] = useState(initialRun);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const router = useRouter();
  const refresh = async () => {
    const response = await fetch(`/api/agents/${run.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Agent 状态暂时不可用。");
    setRun(await response.json() as AgentRunView);
  };
  const cancelRun = async () => {
    setActionError(undefined);
    try {
      const response = await fetch(`/api/agents/${run.id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("Agent 停止请求未确认。");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 停止请求未确认。";
      setActionError(message);
      throw error;
    }
  };
  const cancelWorker = async (_runId: string, workerKey: string) => {
    setActionError(undefined);
    try {
      const response = await fetch(`/api/agents/${run.id}/workers/${encodeURIComponent(workerKey)}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("Worker 停止请求未确认。");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker 停止请求未确认。";
      setActionError(message);
      throw error;
    }
  };
  const deleteRun = async () => {
    if (run.status === "PENDING") return;
    if (!window.confirm("删除这条 Agent 运行详情？对话消息会保留。")) return;
    setDeleting(true);
    setActionError(undefined);
    try {
      const response = await fetch(`/api/agents/${run.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Agent 运行详情删除失败。");
      router.push("/agents");
    } catch (error) {
      setDeleting(false);
      setActionError(error instanceof Error ? error.message : "Agent 运行详情删除失败。");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost"><Link href="/agents"><ArrowLeft className="size-4" />返回 Agent 历史</Link></Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/chat/${run.conversationId}`}><MessageSquareText className="size-4" />返回 Chat</Link></Button>
          <Button disabled={deleting || run.status === "PENDING"} onClick={() => void deleteRun()} title={run.status === "PENDING" ? "请先停止 Agent，待服务端确认终态后再删除" : undefined} variant="destructive"><Trash2 className="size-4" />{deleting ? "正在删除" : "删除运行详情"}</Button>
        </div>
      </div>

      {actionError ? <p className="rounded-control bg-destructive-subtle/76 p-3 text-sm text-destructive-foreground" role="alert">{actionError}</p> : null}

      <section className="premium-panel-strong p-5 sm:p-7">
        <div className="flex flex-wrap gap-2"><span className="premium-chip">{agentModeLabels[run.mode]}</span><span className="premium-chip">{agentRunStatusLabels[run.status]}</span><span className="premium-chip">{getAgentRunProgressLabel(run)}</span><span className="premium-chip">{run.providerCallCount} 次 Provider 调用</span></div>
        <p className="premium-kicker mt-5">原始用户问题</p>
        <h1 className="mt-2 whitespace-pre-wrap break-words text-xl font-semibold leading-8 sm:text-2xl">{run.userProblem}</h1>
        <p className="mt-3 text-xs text-muted-foreground">对话：{run.conversationTitle || run.conversationId} · 开始于 {new Date(run.startedAt).toLocaleString("zh-CN")}</p>
        {run.planOverview ? <div className="mt-5 rounded-control bg-surface-muted/60 p-4"><p className="premium-kicker">Planner 概览{run.planFallback ? " · 安全回退" : ""}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{run.planOverview}</p></div> : null}
      </section>

      <AgentWorkerPanel onCancelRun={cancelRun} onCancelWorker={cancelWorker} run={run} />

      <section className="premium-panel p-5 sm:p-6">
        <p className="premium-kicker">依赖图</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{run.workers.map((worker) => <div className="premium-subpanel min-w-0 p-3 text-sm" key={worker.key}><strong className="break-words">{worker.name}</strong><span className="mx-2 text-muted-foreground">←</span><span className="break-words text-muted-foreground">{worker.dependsOnKeys.length ? worker.dependsOnKeys.join("、") : "无依赖"}</span></div>)}</div>
      </section>

      <section className="premium-panel p-5 sm:p-6">
        <p className="premium-kicker">最终回答 · Assistant Message</p>
        <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{run.assistantMessage.content || "尚无最终回答。"}</div>
        {run.errorCode ? <p className="mt-4 text-xs text-destructive-foreground">错误码：{run.errorCode}</p> : null}
      </section>

      <section className="premium-panel p-5 sm:p-6">
        <p className="premium-kicker">事件时间线</p>
        <ol className="mt-4 space-y-3">{run.events.map((event) => <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm" key={event.sequence}><span className="grid size-8 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-subtle-foreground">{event.sequence}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{event.type}</strong>{event.workerKey ? <span className="premium-chip">{event.workerKey}</span> : null}<time className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("zh-CN")}</time></div>{event.summaryText ? <p className="mt-1 break-words text-muted-foreground">{event.summaryText}</p> : null}</div></li>)}</ol>
      </section>
    </div>
  );
}
