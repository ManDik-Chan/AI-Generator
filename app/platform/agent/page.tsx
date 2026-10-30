import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { LoopArrow, PageIntro, SampleTag, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { agentModes, modeLabels, phaseLabels, phaseOrder, previewAgentRuns, runStatusLabels } from "@/features/platform/demo/agent";

export const metadata: Metadata = { title: "Agent" };

const workerStates = [
  ["排队中", "等待调度"], ["依赖阻塞", "等待上游 Worker"], ["执行中", "正在调用模型"],
  ["已完成", "交付物已保存"], ["已停止", "用户停止，已完成的保留"], ["超时 / 失败", "如实显示，不重试计费"],
] as const;

const statusTone = { PENDING: "lime", COMPLETE: "success", ERROR: "danger", CANCELLED: "neutral" } as const;

export default function DemoAgentPage() {
  return (
    <div className="pb-6">
      <PageIntro
        actions={
          <>
            <Button asChild size="lg"><Link href="/platform/agent/sample-research-split" prefetch={false}>查看运行中示例<ArrowUpRight className="size-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/tools/brainstorm" prefetch={false}>多 Agent 头脑风暴 · 已上线</Link></Button>
          </>
        }
        description="在对话中选择 Agent 模式后，Planner 先把问题拆成有依赖关系的子任务，再由多个 Worker 并行执行，最后由协调器综合成一个回答。Agent 模式处于 Draft 验收阶段；固定四视角的多 Agent 头脑风暴工具已经上线。"
        kicker="AI Hub · Agent"
        meta={<StatusPill status="dev" />}
        title={["Planner 拆解，", "Worker 并行，协调器收束。"]}
      />

      <section aria-labelledby="agent-modes">
        <SectionHead id="agent-modes" meta={<span className="text-caption">真实设计中的限制</span>}>运行模式</SectionHead>
        <div className="grid gap-0.5 min-[821px]:grid-cols-3">
          {agentModes.map((mode, index) => (
            <div className="enter flex min-h-[11rem] flex-col rounded-card bg-surface p-5" key={mode.key} style={delay(60 + index * 60)}>
              <span className="text-[1.25rem] font-medium tracking-[-.02em]">{mode.title}</span>
              <span className="mt-2 text-[.8125rem] leading-5 text-muted-foreground">{mode.detail}</span>
              <span className="mt-auto pt-6 font-code text-[.75rem]">{mode.cost}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-0.5 grid gap-0.5 min-[1024px]:grid-cols-2">
        <section aria-labelledby="agent-phases" className="rounded-card bg-surface p-5">
          <SectionHead id="agent-phases">执行阶段</SectionHead>
          <ol className="grid grid-cols-5 gap-1">
            {phaseOrder.map((phase, index) => (
              <li className="rounded-control bg-surface-raised px-1 py-3 text-center" key={phase}>
                <span className="block font-code text-[.6875rem] text-muted-foreground">0{index + 1}</span>
                <span className="mt-1 block text-xs font-medium">{phaseLabels[phase]}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[.75rem] leading-5 text-muted-foreground">刷新或切到后台只会断开观察，不会重新提交或重复计费；回到页面后按运行 ID 恢复状态。</p>
        </section>
        <section aria-labelledby="agent-worker-states" className="rounded-card bg-surface p-5">
          <SectionHead id="agent-worker-states">Worker 状态</SectionHead>
          <dl className="grid grid-cols-2 gap-x-4 border-t border-border/12 min-[521px]:grid-cols-3">
            {workerStates.map(([name, detail]) => (
              <div className="border-b border-border/12 py-2.5" key={name}><dt className="text-sm font-medium">{name}</dt><dd className="mt-0.5 text-[.75rem] text-muted-foreground">{detail}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="agent-runs" className="mt-16">
        <SectionHead id="agent-runs" meta={<SampleTag>示例运行 · 非真实输出</SampleTag>}>运行记录</SectionHead>
        <ul className="border-t border-border/12">
          {previewAgentRuns.map((run) => {
            const done = run.workers.filter((worker) => worker.status === "COMPLETE").length;
            return (
              <li key={run.id}>
                <Link className="group grid gap-x-6 gap-y-2 border-b border-border/12 py-4 min-[821px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[821px]:items-center" href={`/platform/agent/${run.id}`} prefetch={false}>
                  <span className="min-w-0">
                    <span className="link-grow block w-fit max-w-full text-[.9375rem] font-medium">{run.problem}</span>
                    <span className="mt-1 block text-[.75rem] text-muted-foreground">{run.started} · {modeLabels[run.mode]}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[.6875rem] text-muted-foreground">
                    <ToneBadge dot tone={statusTone[run.status]}>{runStatusLabels[run.status]}</ToneBadge>
                    <span className="rounded-full border border-border/14 px-2 py-0.5">阶段 · {phaseLabels[run.phase]}</span>
                    <span className="rounded-full border border-border/14 px-2 py-0.5 tabular-nums">Worker {done}/{run.workers.length}</span>
                    <span className="rounded-full border border-border/14 px-2 py-0.5 tabular-nums">调用 {run.providerCallCount}</span>
                  </span>
                  <LoopArrow className="hidden text-muted-foreground group-hover:text-foreground min-[821px]:inline-grid" />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[.75rem] text-muted-foreground">真实运行记录在登录后的 Agent 页面中，只对本人可见。</p>
      </section>
    </div>
  );
}
