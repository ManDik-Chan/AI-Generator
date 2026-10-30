import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SampleTag, SectionHead, SpecRow, StatusPill } from "@/components/platform/primitives";
import { AgentRunBoard } from "@/features/platform/demo/agent-run-board";
import { getPreviewAgentRun, modeLabels, phaseLabels, phaseOrder, previewAgentRuns, runStatusLabels } from "@/features/platform/demo/agent";
import { getMyProject } from "@/features/platform/source";
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

export default async function DemoAgentRunPage({ params }: Props) {
  const run = getPreviewAgentRun((await params).runId);
  if (!run) notFound();
  const done = run.workers.filter((worker) => worker.status === "COMPLETE").length;
  const project = run.project ? getMyProject(run.project).data : undefined;
  const phaseIndex = phaseOrder.indexOf(run.phase);
  const roots = run.workers.filter((worker) => !worker.dependsOnKeys.length);
  const dependents = run.workers.filter((worker) => worker.dependsOnKeys.length);
  const columns = [{ title: "并行 Worker", items: roots }, ...(dependents.length ? [{ title: "依赖上游", items: dependents }] : [])];

  return (
    <div className="pb-6">
      <Link className="group mb-6 inline-flex items-center gap-1.5 text-[.8125rem] text-muted-foreground hover:text-foreground" href="/platform/agent" prefetch={false}>
        <ArrowLeft aria-hidden="true" className="size-3.5" /><span className="link-grow">全部运行</span>
      </Link>
      <header className="pb-10">
        <div className="flex flex-wrap items-center gap-2"><p className="kicker">Agent 运行<span aria-hidden="true" className="kicker__arrow">↓</span></p><StatusPill status="dev" /><SampleTag /></div>
        <h1 className="mt-4 max-w-[52rem] text-balance text-[clamp(2rem,4vw,3.5rem)] font-medium leading-[1.06] tracking-[-.04em]"><span className="title-line"><span>{run.problem}</span></span></h1>
        <p className="enter mt-4 max-w-[40rem] text-[.9375rem] leading-7 text-muted-foreground">以下 Planner 概览、Worker 交付物与回答均为手写的演示内容，没有调用任何模型。</p>
      </header>

      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <section aria-labelledby="run-graph" className="rounded-card bg-surface p-5">
          <SectionHead id="run-graph">编排结构</SectionHead>
          <ol className="mb-5 grid grid-cols-5 gap-1">
            {phaseOrder.map((phase, index) => (
              <li className={cn("rounded-full px-1 py-2 text-center text-xs", index < phaseIndex || run.phase === "FINISHED" ? "bg-foreground text-background" : index === phaseIndex ? "bg-lime font-medium text-[hsl(var(--ink))]" : "bg-surface-raised text-muted-foreground")} key={phase}>{phaseLabels[phase]}</li>
            ))}
          </ol>
          <div className="grid gap-3 min-[640px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[640px]:items-center">
            <div className="rounded-control bg-surface-raised p-3"><p className="text-[.75rem] font-medium">Planner</p><p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">{run.planOverview}</p></div>
            <span aria-hidden="true" className="hidden text-muted-foreground min-[640px]:block">→</span>
            <div className="grid gap-2">
              {columns.map((column) => (
                <div key={column.title}>
                  <p className="mb-1.5 text-[.6875rem] text-muted-foreground">{column.title}</p>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {column.items.map((worker) => (
                      <li className="flex min-w-0 items-center gap-2 rounded-full bg-surface-raised px-3 py-2 text-xs" key={worker.key}>
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
        <section aria-labelledby="run-facts" className="rounded-card bg-surface p-5">
          <SectionHead id="run-facts">运行概况</SectionHead>
          <dl className="border-t border-border/12">
            <SpecRow label="模式">{modeLabels[run.mode]}</SpecRow>
            <SpecRow label="状态">{runStatusLabels[run.status]}</SpecRow>
            <SpecRow label="阶段">{phaseLabels[run.phase]}</SpecRow>
            <SpecRow label="Worker">{`${done}/${run.workers.length} 完成`}</SpecRow>
            <SpecRow label="模型调用">{`${run.providerCallCount} 次`}</SpecRow>
            <SpecRow label="项目">{project ? <Link className="link-grow" href={`/platform/projects/${project.slug}`} prefetch={false}>{project.name}</Link> : "个人对话"}</SpecRow>
            <SpecRow label="开始">{run.started}</SpecRow>
          </dl>
        </section>
      </div>

      <section aria-labelledby="run-workers" className="mt-16">
        <SectionHead id="run-workers" meta={<SampleTag>复用真实 Worker 卡片 · 示例数据</SampleTag>}>Worker</SectionHead>
        <AgentRunBoard workers={run.workers} />
      </section>

      <div className="mt-16 grid gap-0.5 min-[1024px]:grid-cols-2">
        <section aria-labelledby="run-events" className="rounded-card bg-surface p-5">
          <SectionHead id="run-events">事件时间线</SectionHead>
          <ol className="mt-2 border-l border-border/16 pl-4">
            {run.events.map((item) => (
              <li className="relative pb-4 before:absolute before:-left-[1.3rem] before:top-1.5 before:size-2 before:rounded-full before:bg-foreground last:pb-0" key={item.sequence}>
                <p className="font-code text-[.6875rem] text-muted-foreground">{item.type}</p>
                <p className="mt-0.5 text-sm">{item.summaryText}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="run-answer" className="rounded-card bg-surface p-5">
          <SectionHead id="run-answer">最终回答</SectionHead>
          {run.answer ? <p className="text-sm leading-7 text-muted-foreground">{run.answer}</p> : (
            <p className="rounded-control border border-dashed border-foreground/18 px-4 py-8 text-center text-[.75rem] text-muted-foreground">{run.status === "CANCELLED" ? "运行在综合前停止，没有最终回答。" : "Worker 完成后，协调器才会生成最终回答。"}</p>
          )}
        </section>
      </div>
    </div>
  );
}
