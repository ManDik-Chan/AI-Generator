import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { BlockLabel, FactList, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { AgentRunBoard } from "@/features/platform-preview/components/agent-run-board";
import { SampleBadge } from "@/features/platform-preview/components/status-badge";
import { getPreviewAgentRun, modeLabels, phaseLabels, phaseOrder, previewAgentRuns, runStatusLabels } from "@/features/platform-preview/data/agent";
import { getPreviewProject } from "@/features/platform-preview/data/projects";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ runId: string }> };

export function generateStaticParams() {
  return previewAgentRuns.map((run) => ({ runId: run.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const run = getPreviewAgentRun((await params).runId);
  return { title: run ? `示例运行：${run.problem}` : "Agent 运行" };
}

const dot: Record<string, string> = {
  COMPLETE: "bg-success", RUNNING: "bg-lime", QUEUED: "bg-muted-foreground/40", BLOCKED: "bg-warning", CANCELLED: "bg-muted-foreground", ERROR: "bg-destructive", TIMEOUT: "bg-destructive",
};

export default async function PlatformAgentRunPage({ params }: Props) {
  const run = getPreviewAgentRun((await params).runId);
  if (!run) notFound();
  const done = run.workers.filter((worker) => worker.status === "COMPLETE").length;
  const project = run.project ? getPreviewProject(run.project) : undefined;
  const phaseIndex = phaseOrder.indexOf(run.phase);
  const roots = run.workers.filter((worker) => !worker.dependsOnKeys.length);
  const dependents = run.workers.filter((worker) => worker.dependsOnKeys.length);
  const columns = [{ title: "并行 Worker", items: roots }, ...(dependents.length ? [{ title: "依赖上游", items: dependents }] : [])];

  return (
    <div className="pb-6">
      <PreviewHeader
        back={{ href: "/platform/agent", label: "全部运行" }}
        description={<>示例问题：{run.problem}<br />以下 Planner 概览、Worker 交付物与回答均为手写的演示内容，没有调用任何模型。</>}
        status="dev"
        title={run.status === "PENDING" ? "运行中的 Agent 示例" : run.status === "CANCELLED" ? "已停止的 Agent 示例" : "已完成的 Agent 示例"}
      />

      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <section aria-labelledby="run-graph" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="run-graph" meta={<SampleBadge />}>编排结构</BlockLabel>
          <ol className="mb-5 mt-3 grid grid-cols-5 gap-1">
            {phaseOrder.map((phase, index) => (
              <li className={cn("rounded-control px-1 py-2 text-center text-xs", index < phaseIndex || run.phase === "FINISHED" ? "bg-foreground text-background" : index === phaseIndex ? "bg-lime font-medium text-[hsl(213_21%_10%)]" : "bg-background/60 text-muted-foreground")} key={phase}>{phaseLabels[phase]}</li>
            ))}
          </ol>
          <div className="grid gap-3 min-[640px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[640px]:items-center">
            <div className="rounded-control bg-background/60 p-3"><p className="premium-kicker">Planner</p><p className="mt-1 text-caption">{run.planOverview}</p></div>
            <span aria-hidden="true" className="hidden text-muted-foreground min-[640px]:block">→</span>
            <div className="grid gap-2">
              {columns.map((column) => (
                <div key={column.title}>
                  <p className="mb-1.5 text-[.6875rem] text-muted-foreground">{column.title}</p>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {column.items.map((worker) => (
                      <li className="flex min-w-0 items-center gap-2 rounded-full bg-background/60 px-3 py-2 text-xs" key={worker.key}>
                        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot[worker.status])} />
                        <span className="truncate">{worker.name} · {worker.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-control border border-dashed border-foreground/18 p-3 text-center text-xs text-muted-foreground">
            协调器 · {run.status === "COMPLETE" ? "已综合全部交付物" : run.status === "CANCELLED" ? "运行已停止，未调用协调器" : "等待至少两个 Worker 完成"}
          </div>
        </section>
        <section aria-labelledby="run-facts" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="run-facts">运行概况</BlockLabel>
          <FactList rows={[
            ["模式", modeLabels[run.mode]],
            ["状态", runStatusLabels[run.status]],
            ["阶段", phaseLabels[run.phase]],
            ["Worker", `${done}/${run.workers.length} 完成`],
            ["模型调用", `${run.providerCallCount} 次`],
            ["项目", project ? <Link className="link-grow" href={`/platform/projects/${project.slug}`} prefetch={false}>{project.name}</Link> : "个人对话"],
            ["开始", run.started],
          ]} />
        </section>
      </div>

      <section aria-labelledby="run-workers" className="mt-14">
        <BlockLabel id="run-workers" meta={<SampleBadge label="复用真实 Worker 卡片 · 示例数据" />}>Worker</BlockLabel>
        <AgentRunBoard workers={run.workers} />
      </section>

      <div className="mt-14 grid gap-0.5 min-[1024px]:grid-cols-2">
        <section aria-labelledby="run-events" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="run-events" meta={<SampleBadge />}>事件时间线</BlockLabel>
          <ol className="mt-2 border-l border-border/16 pl-4">
            {run.events.map((item) => (
              <li className="relative pb-4 before:absolute before:-left-[1.3rem] before:top-1.5 before:size-2 before:rounded-full before:bg-foreground last:pb-0" key={item.sequence}>
                <p className="font-mono text-[.6875rem] text-muted-foreground">{item.type}</p>
                <p className="mt-0.5 text-sm">{item.summaryText}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="run-answer" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="run-answer" meta={<SampleBadge />}>最终回答</BlockLabel>
          {run.answer ? <p className="text-sm leading-7 text-muted-foreground">{run.answer}</p> : (
            <p className="rounded-control border border-dashed border-foreground/18 px-4 py-8 text-center text-caption">{run.status === "CANCELLED" ? "运行在综合前停止，没有最终回答。" : "Worker 完成后，协调器才会生成最终回答。"}</p>
          )}
        </section>
      </div>
    </div>
  );
}
