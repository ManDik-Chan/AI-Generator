"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, Layers3, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentRunView } from "@/features/agents/client-types";
import { AgentWorkerCard } from "@/features/agents/components/agent-worker-card";

const phaseLabels: Record<AgentRunView["phase"], string> = {
  PLANNING: "正在规划",
  DISPATCHING: "正在创建 Worker",
  WORKING: "Worker 并行执行中",
  SYNTHESIZING: "正在综合",
  FINISHED: "已完成",
};

function runLabel(run: AgentRunView) {
  if (run.status === "CANCELLED") return "已停止";
  if (run.errorCode === "TIMEOUT") return "超时";
  if (run.status === "ERROR") return run.successfulWorkerCount ? "部分完成" : "失败";
  return phaseLabels[run.phase];
}

function runElapsed(run: AgentRunView, now: number) {
  const end = run.completedAt ? new Date(run.completedAt).getTime() : now;
  const milliseconds = Math.max(0, end - new Date(run.startedAt).getTime());
  return milliseconds >= 60_000 ? `${Math.floor(milliseconds / 60_000)}分 ${Math.floor(milliseconds % 60_000 / 1000)}秒` : `${Math.floor(milliseconds / 1000)}秒`;
}

interface AgentWorkerPanelProps {
  run: AgentRunView;
  onCancelRun(runId: string): Promise<void>;
  onCancelWorker(runId: string, workerKey: string): Promise<void>;
}

export function AgentWorkerPanel({ run, onCancelRun, onCancelWorker }: AgentWorkerPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run.status !== "PENDING") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run.status]);
  const workers = failedOnly ? run.workers.filter((worker) => ["BLOCKED", "ERROR", "CANCELLED", "TIMEOUT"].includes(worker.status)) : run.workers;
  const copyFinal = async () => {
    if (!run.assistantMessage.content) return;
    await navigator.clipboard.writeText(run.assistantMessage.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="rounded-card border border-primary/18 bg-primary-subtle/24 p-3 shadow-soft sm:p-5" data-agent-worker-panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="premium-icon-tile size-9"><Layers3 className="size-4" /></span><div><p className="premium-kicker">AGENT WORKERS · {run.mode === "DEEP" ? "深度" : "标准"}</p><h3 className="mt-0.5 text-sm font-semibold">{runLabel(run)}</h3></div></div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="premium-chip">{run.completedWorkerCount}/{run.plannedWorkerCount} Worker</span>
            <span className="premium-chip">{run.successfulWorkerCount} 成功</span>
            <span className="premium-chip">{run.providerCallCount} 次调用</span>
            <span className="premium-chip">{runElapsed(run, now)}</span>
            {run.status === "PENDING" ? <span className="premium-chip"><span className="size-1.5 animate-pulse rounded-full bg-primary" />后台继续</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button aria-expanded={!collapsed} className="min-h-11" onClick={() => setCollapsed((value) => !value)} size="sm" type="button" variant="outline">{collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}{collapsed ? "展开" : "折叠"}</Button>
          <Button asChild className="min-h-11" size="sm" variant="outline"><Link href={`/agents/${run.id}`} prefetch={false}>查看详情<ExternalLink className="size-3.5" /></Link></Button>
          {run.status === "PENDING" ? <Button className="min-h-11" disabled={stopping} onClick={() => { setStopping(true); void onCancelRun(run.id).finally(() => setStopping(false)); }} size="sm" type="button" variant="outline"><Square className="size-3.5 fill-current" />{stopping ? "正在确认" : "全部停止"}</Button> : null}
        </div>
      </div>
      {!collapsed ? (
        <div className="mt-5">
          {run.planOverview ? <p className="mb-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{run.planOverview}{run.planFallback ? "（安全回退计划）" : ""}</p> : null}
          <div className="mb-3 flex flex-wrap gap-2">
            <Button aria-pressed={expandAll} className="min-h-11" onClick={() => setExpandAll((value) => !value)} size="sm" type="button" variant="ghost">{expandAll ? "收起 Worker" : "展开全部"}</Button>
            <Button aria-pressed={failedOnly} className="min-h-11" onClick={() => setFailedOnly((value) => !value)} size="sm" type="button" variant="ghost">{failedOnly ? "查看全部" : "只看失败"}</Button>
            {run.assistantMessage.content ? <Button className="min-h-11" onClick={() => void copyFinal()} size="sm" type="button" variant="ghost">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "已复制" : "复制最终回答"}</Button> : null}
          </div>
          {workers.length ? <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{workers.map((worker) => <AgentWorkerCard forceOpen={expandAll} key={worker.key} now={now} onCancel={(workerKey) => onCancelWorker(run.id, workerKey)} worker={worker} />)}</div> : <p className="rounded-control border border-border/10 p-4 text-sm text-muted-foreground">当前筛选下没有 Worker。</p>}
          {run.errorCode ? <p className="mt-4 text-xs text-destructive-foreground">运行错误码：{run.errorCode}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
