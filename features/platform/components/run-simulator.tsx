"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { dataFlowMeta, runStatusMeta } from "@/features/platform/labels";
import { advanceRun, isTerminal, runPath } from "@/features/platform/run-lifecycle";
import type { ProjectCapability, ProjectRun, RunStatus } from "@/features/platform/types";
import { cn } from "@/lib/utils";

interface ActiveRun {
  id: string;
  capability: ProjectCapability;
  status: RunStatus;
  startedAt: number;
  log: { status: RunStatus; at: number }[];
}

const SCHEDULE: [RunStatus, number][] = [["ACCEPTED", 700], ["RUNNING", 1600]];

function shortId() {
  return `run_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Walks the documented run lifecycle locally so owners can see how an async run is
 * presented. It never calls a service and nothing is saved; the panel says so.
 */
export function RunSimulator({ capabilities, initialRuns }: { capabilities: ProjectCapability[]; initialRuns: ProjectRun[] }) {
  const runnable = capabilities.filter((capability) => capability.id !== "presentation.read" && capability.id !== "documentation.read");
  const options = runnable.length ? runnable : capabilities;
  const [capabilityId, setCapabilityId] = useState(options[0]?.id);
  const [consent, setConsent] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [history, setHistory] = useState<ProjectRun[]>(initialRuns);
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef<number[]>([]);

  const capability = options.find((item) => item.id === capabilityId) ?? options[0];
  const needsConsent = capability?.dataFlow === "developer";

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  useEffect(() => {
    if (!active || isTerminal(active.status)) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [active]);

  const activeRef = useRef<ActiveRun | null>(null);
  const commit = (run: ActiveRun | null) => {
    activeRef.current = run;
    setActive(run);
  };

  const move = (to: RunStatus) => {
    const current = activeRef.current;
    if (!current) return;
    const next = advanceRun(current.status, to);
    if (next === current.status) return;
    commit({ ...current, status: next, log: [...current.log, { status: next, at: Date.now() }] });
    if (!isTerminal(next)) return;
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    const seconds = Math.max(1, Math.round((Date.now() - current.startedAt) / 1000));
    setHistory((runs) => [{ id: current.id, capability: current.capability.id, status: next, started: "刚刚", duration: `${seconds} 秒`, actor: "你（演示）", note: "本地模拟 · 未调用服务" }, ...runs]);
  };

  const start = () => {
    if (!capability || (needsConsent && !consent)) return;
    timers.current.forEach((id) => window.clearTimeout(id));
    const startedAt = Date.now();
    setNow(startedAt);
    commit({ id: shortId(), capability, status: "PENDING", startedAt, log: [{ status: "PENDING", at: startedAt }] });
    timers.current = [
      ...SCHEDULE.map(([status, ms]) => window.setTimeout(() => move(status), ms)),
      window.setTimeout(() => move(failNext ? "FAILED" : "SUCCEEDED"), 4200),
    ];
  };

  const running = active && !isTerminal(active.status);
  const elapsed = active ? ((isTerminal(active.status) ? active.log[active.log.length - 1].at : now) - active.startedAt) / 1000 : 0;
  const reached = new Set(active?.log.map((entry) => entry.status));
  const terminal = active && isTerminal(active.status) ? active.status : null;

  return (
    <div className="space-y-10">
      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="rounded-card bg-surface p-5">
          <p className="text-sm font-medium">新建演示运行</p>
          <p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">在你的浏览器中模拟 PENDING → ACCEPTED → RUNNING → 终态。不调用任何服务，也不会保存。</p>
          <label className="mt-5 block text-[.75rem] text-muted-foreground" htmlFor="run-capability">能力</label>
          <select className="premium-field mt-1.5 h-11 px-4 text-sm" disabled={Boolean(running)} id="run-capability" onChange={(event) => { setCapabilityId(event.target.value); setConsent(false); }} value={capability?.id}>
            {options.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.id}</option>)}
          </select>
          {capability ? (
            <p className="mt-3 flex items-start gap-2 text-[.75rem] leading-5 text-muted-foreground">
              <span aria-hidden="true" className={cn("mt-[.4rem] size-1.5 shrink-0 rounded-full", needsConsent ? "bg-warning" : "bg-primary")} />
              <span><b className="font-medium text-foreground">{dataFlowMeta[capability.dataFlow].label}</b> · {dataFlowMeta[capability.dataFlow].detail}</span>
            </p>
          ) : null}
          {needsConsent ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-control border border-border/14 bg-surface-raised p-3 text-[.8125rem] leading-5">
              <input checked={consent} className="mt-1 size-4 accent-[hsl(var(--foreground))]" disabled={Boolean(running)} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
              <span>我同意本次输入交给项目运营方的服务处理。<span className="block text-[.75rem] text-muted-foreground">每次运行单独确认；撤销授权后新的运行会被拒绝。</span></span>
            </label>
          ) : null}
          <label className="mt-3 flex items-center gap-2 text-[.75rem] text-muted-foreground">
            <input checked={failNext} className="size-3.5 accent-[hsl(var(--foreground))]" disabled={Boolean(running)} onChange={(event) => setFailNext(event.target.checked)} type="checkbox" />
            模拟一次失败
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={Boolean(running) || (needsConsent && !consent)} onClick={start} size="sm"><Play className="size-3.5" />开始</Button>
            <Button disabled={!running} onClick={() => move("CANCELLED")} size="sm" variant="outline"><Square className="size-3.5" />取消运行</Button>
          </div>
        </div>

        <div className="flex min-h-[16rem] flex-col rounded-card bg-surface p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="font-code text-[.8125rem]">{active ? active.id : "等待开始"}</p>
            {active ? <ToneBadge dot tone={runStatusMeta[active.status].tone}>{runStatusMeta[active.status].label}</ToneBadge> : null}
          </div>
          <ol className="mt-6 grid grid-cols-4 gap-1.5">
            {runPath.map((status, index) => {
              const label = index === 3 ? (terminal ? runStatusMeta[terminal].label : "终态") : runStatusMeta[status].label;
              const done = index === 3 ? Boolean(terminal) : reached.has(status);
              const current = active?.status === status || (index === 3 && Boolean(terminal));
              return (
                <li className="min-w-0" key={status}>
                  <span className={cn("block h-1.5 rounded-full transition-colors duration-500", done ? (index === 3 && terminal && terminal !== "SUCCEEDED" ? "bg-warning" : "bg-foreground") : "bg-foreground/12", current && running && "animate-pulse motion-reduce:animate-none")} />
                  <span className={cn("mt-2 block truncate text-[.6875rem]", done ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                  <span className="block font-code text-[.625rem] text-muted-foreground">{index === 3 ? "SUCCEEDED / FAILED / CANCELLED / TIMED_OUT" : status}</span>
                </li>
              );
            })}
          </ol>
          <div className="mt-auto flex items-end justify-between gap-4 pt-8">
            <p className="text-[clamp(2rem,3vw,2.75rem)] font-medium leading-none tracking-[-.04em] tabular-nums">{elapsed.toFixed(1)}<span className="ml-1 text-sm text-muted-foreground">s</span></p>
            <p className="max-w-[16rem] text-right text-[.75rem] leading-5 text-muted-foreground">真实运行会立即返回 202 与 runId；刷新或离开页面不会重复提交，回来后按 runId 恢复状态。</p>
          </div>
        </div>
      </div>

      <div>
        <p className="kicker mb-4">运行记录<span aria-hidden="true" className="kicker__arrow">↓</span></p>
        <div className="scroll-x">
          <table className="w-full min-w-[40rem] border-collapse text-left text-[.8125rem]">
            <thead>
              <tr className="border-b border-border/12 text-[.75rem] text-muted-foreground">
                <th className="py-2.5 pr-4 font-medium" scope="col">运行</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">能力</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">状态</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">开始</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">耗时</th>
                <th className="py-2.5 font-medium" scope="col">发起人 · 备注</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr className="border-b border-border/10" key={run.id}>
                  <td className="py-3 pr-4 font-code">{run.id}</td>
                  <td className="py-3 pr-4 font-code text-[.75rem] text-muted-foreground">{run.capability}</td>
                  <td className="py-3 pr-4"><ToneBadge dot tone={runStatusMeta[run.status].tone}>{runStatusMeta[run.status].label}</ToneBadge></td>
                  <td className="py-3 pr-4 text-muted-foreground">{run.started}</td>
                  <td className="py-3 pr-4 tabular-nums text-muted-foreground">{run.duration}</td>
                  <td className="py-3 text-muted-foreground">{run.actor}{run.note ? <span className="block text-[.6875rem]">{run.note}</span> : null}</td>
                </tr>
              ))}
              {!history.length ? <tr><td className="py-8 text-center text-muted-foreground" colSpan={6}>还没有运行记录。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
