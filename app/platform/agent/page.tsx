import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlockLabel, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { SampleBadge, StatusBadge } from "@/features/platform-preview/components/status-badge";
import { agentModes, modeLabels, phaseLabels, phaseOrder, previewAgentRuns, runStatusLabels } from "@/features/platform-preview/data/agent";
import { platformModules } from "@/features/platform-preview/navigation";

export const metadata: Metadata = { title: "Agent 编排" };

const workerStates = [
  ["排队中", "等待调度"], ["依赖阻塞", "等待上游 Worker"], ["执行中", "正在调用模型"], ["已完成", "交付物已保存"],
  ["已停止", "用户停止，已完成的保留"], ["超时 / 失败", "如实显示，不重试计费"],
] as const;

export default function PlatformAgentPage() {
  const current = platformModules[2];
  return (
    <div className="pb-6">
      <PreviewHeader
        actions={<>
          <Button asChild size="lg"><Link href="/platform/agent/sample-research-split" prefetch={false}>查看运行中示例<ArrowUpRight className="size-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/tools/brainstorm" prefetch={false}>多 Agent 头脑风暴 · 已上线</Link></Button>
        </>}
        description="在对话中选择 Agent 模式后，Planner 先把问题拆成有依赖关系的子任务，再由多个 Worker 并行执行，最后由协调器综合成一个回答。该模式处于 Draft 验收阶段；固定 4 视角的多 Agent 头脑风暴工具已上线。"
        module={current}
        title="Planner 拆解，Worker 并行，协调器收束。"
      />

      <section aria-labelledby="agent-modes">
        <BlockLabel id="agent-modes" meta={<span className="text-caption">真实设计中的限制</span>}>运行模式</BlockLabel>
        <div className="grid gap-0.5 min-[821px]:grid-cols-3">
          {agentModes.map((mode) => (
            <div className="flex min-h-[10rem] flex-col rounded-card bg-surface p-4 min-[821px]:p-5" key={mode.key}>
              <p className="text-card-title">{mode.title}</p>
              <p className="mt-2 text-caption">{mode.detail}</p>
              <p className="mt-auto pt-5 text-xs font-medium">{mode.cost}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-0.5 grid gap-0.5 min-[1024px]:grid-cols-2">
        <section aria-labelledby="agent-phases" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="agent-phases">执行阶段</BlockLabel>
          <ol className="mt-3 grid grid-cols-5 gap-1">
            {phaseOrder.map((phase, index) => (
              <li className="rounded-control bg-background/60 px-1 py-3 text-center" key={phase}>
                <span className="block text-[.6875rem] tabular-nums text-muted-foreground">0{index + 1}</span>
                <span className="mt-1 block text-xs font-medium">{phaseLabels[phase]}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-caption">页面刷新或切到后台只会断开观察，不会重新提交或重复计费；回到页面后按运行 ID 恢复状态。</p>
        </section>
        <section aria-labelledby="agent-worker-states" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="agent-worker-states">Worker 状态</BlockLabel>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 border-t border-border/14 min-[521px]:grid-cols-3">
            {workerStates.map(([name, detail]) => (
              <div className="border-b border-border/14 py-2.5" key={name}><dt className="text-sm font-medium">{name}</dt><dd className="mt-0.5 text-caption">{detail}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="agent-runs" className="mt-14">
        <BlockLabel id="agent-runs" meta={<SampleBadge label="示例运行 · 非真实输出" />}>运行记录</BlockLabel>
        <div className="border-t border-border/14">
          {previewAgentRuns.map((run) => {
            const done = run.workers.filter((worker) => worker.status === "COMPLETE").length;
            return (
              <Link className="group grid gap-x-6 gap-y-2 border-b border-border/14 py-4 min-[821px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[821px]:items-center" href={`/platform/agent/${run.id}`} key={run.id} prefetch={false}>
                <span className="min-w-0">
                  <span className="link-grow block w-fit max-w-full text-sm font-medium">{run.problem}</span>
                  <span className="mt-1 block text-caption">{run.started} · {modeLabels[run.mode]}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <span className="premium-chip">{runStatusLabels[run.status]}</span>
                  <span className="premium-chip">阶段 · {phaseLabels[run.phase]}</span>
                  <span className="premium-chip tabular-nums">Worker {done}/{run.workers.length}</span>
                  <span className="premium-chip tabular-nums">调用 {run.providerCallCount}</span>
                </span>
                <ArrowRight aria-hidden="true" className="hidden size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:translate-x-1 group-hover:text-foreground min-[821px]:block" />
              </Link>
            );
          })}
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-caption"><StatusBadge status="dev" />真实运行记录在登录后的 Agent 运行页中，只对本人可见。</p>
      </section>
    </div>
  );
}
