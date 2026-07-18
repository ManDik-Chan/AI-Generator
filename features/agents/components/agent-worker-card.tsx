"use client";

import { useState } from "react";
import { Check, Copy, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentWorkerView } from "@/features/agents/client-types";
import { cn } from "@/lib/utils";

const statusLabels: Record<AgentWorkerView["status"], string> = {
  QUEUED: "排队中", BLOCKED: "依赖阻塞", RUNNING: "执行中", COMPLETE: "已完成",
  ERROR: "失败", CANCELLED: "已停止", TIMEOUT: "超时",
};

function elapsed(startedAt: string | null, completedAt: string | null, now: number) {
  if (!startedAt) return "尚未开始";
  const milliseconds = Math.max(0, (completedAt ? new Date(completedAt).getTime() : now) - new Date(startedAt).getTime());
  return milliseconds >= 60_000 ? `${Math.floor(milliseconds / 60_000)}分 ${Math.floor(milliseconds % 60_000 / 1000)}秒` : `${Math.floor(milliseconds / 1000)}秒`;
}

interface AgentWorkerCardProps {
  worker: AgentWorkerView;
  now: number;
  forceOpen: boolean;
  onCancel(workerKey: string): Promise<void>;
}

export function AgentWorkerCard({ worker, now, forceOpen, onCancel }: AgentWorkerCardProps) {
  const [stopping, setStopping] = useState(false);
  const [copied, setCopied] = useState(false);
  const canCancel = worker.status === "QUEUED" || worker.status === "RUNNING";
  const copyDeliverable = async () => {
    if (!worker.finalDeliverable) return;
    await navigator.clipboard.writeText(worker.finalDeliverable);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <details className="premium-subpanel group min-w-0 p-4" open={forceOpen || undefined}>
      <summary className="cursor-pointer list-none rounded-control outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="premium-kicker">{worker.name}</span>
              <span className={cn("premium-chip", worker.status === "COMPLETE" && "bg-success-subtle text-success-foreground", ["ERROR", "TIMEOUT", "BLOCKED"].includes(worker.status) && "bg-destructive-subtle text-destructive-foreground")}>{statusLabels[worker.status]}</span>
            </div>
            <h4 className="mt-2 break-words text-sm font-semibold">{worker.title}</h4>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{worker.workSummary || worker.objective}</p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{elapsed(worker.startedAt, worker.completedAt, now)}</span>
        </div>
      </summary>
      <div className="mt-4 space-y-4 border-t border-border/10 pt-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="premium-kicker">任务目标</p><p className="mt-1 whitespace-pre-wrap break-words leading-6 text-muted-foreground">{worker.objective}</p></div>
          <div><p className="premium-kicker">预期交付</p><p className="mt-1 whitespace-pre-wrap break-words leading-6 text-muted-foreground">{worker.expectedDeliverable}</p></div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="premium-chip">优先级 {worker.priority}</span>
          <span className="premium-chip">依赖 {worker.dependsOnKeys.length ? worker.dependsOnKeys.join("、") : "无"}</span>
          {!worker.structured && worker.status === "COMPLETE" ? <span className="premium-chip">安全文本交付</span> : null}
          {worker.errorCode ? <span className="premium-chip">{worker.errorCode}</span> : null}
        </div>
        {(["findings", "assumptions", "risks", "recommendations"] as const).map((field) => worker[field].length ? (
          <section key={field}>
            <p className="premium-kicker">{{ findings: "发现", assumptions: "假设", risks: "风险", recommendations: "建议" }[field]}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{worker[field].map((item) => <li className="break-words" key={item}>{item}</li>)}</ul>
          </section>
        ) : null)}
        {worker.finalDeliverable ? <section><p className="premium-kicker">最终交付物</p><p className="mt-2 whitespace-pre-wrap break-words leading-6 text-muted-foreground">{worker.finalDeliverable}</p></section> : null}
        <div className="flex flex-wrap gap-2">
          {worker.finalDeliverable ? <Button className="min-h-11" onClick={() => void copyDeliverable()} size="sm" type="button" variant="outline">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "已复制" : "复制交付物"}</Button> : null}
          {canCancel ? <Button className="min-h-11" disabled={stopping} onClick={() => { setStopping(true); void onCancel(worker.key).finally(() => setStopping(false)); }} size="sm" type="button" variant="outline"><Square className="size-3.5 fill-current" />{stopping ? "正在确认" : "停止该 Worker"}</Button> : null}
        </div>
      </div>
    </details>
  );
}
