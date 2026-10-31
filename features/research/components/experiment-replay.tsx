"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Play, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CheckList, ResultTable } from "@/features/research/components/result-table";
import { compareOutcomes, replaySpecs, runReplay, type Comparison, type ReplayKind, type ReplayOutcome } from "@/features/research/replays";
import { cn } from "@/lib/utils";

interface Attempt {
  n: number;
  seed: number;
  ms: number;
  outcome: ReplayOutcome;
  /** Only when the seed equals the reference seed. */
  comparison?: Comparison;
}

type Phase = { kind: "idle" } | { kind: "running" } | { kind: "error"; message: string };

function verdictText(attempt: Attempt) {
  const passed = attempt.outcome.checks.filter((check) => check.pass).length;
  const total = attempt.outcome.checks.length;
  if (!attempt.comparison) return { tone: "info" as const, title: `种子 ${attempt.seed} 与参考不同，不做数值比对`, detail: `按协议判定：${passed}/${total} 项通过。` };
  const { comparison } = attempt;
  const cells = Object.values(comparison.cells);
  const agreeing = cells.filter(Boolean).length;
  if (comparison.comparable && comparison.valuesAgree && comparison.checksAgree) {
    return { tone: "success" as const, title: "与参考结果一致", detail: `${agreeing}/${cells.length} 个数值在协议容差内，判定相同（${passed}/${total} 项通过）。` };
  }
  return { tone: "danger" as const, title: "与参考结果不一致", detail: comparison.comparable ? `${agreeing}/${cells.length} 个数值在容差内；${comparison.checksAgree ? "判定相同" : "判定不同"}。不一致的数值以 ≠ 标出。` : "结果的结构与参考不同，无法逐项比对。" };
}

const bannerTone = {
  success: "bg-success-subtle text-success-foreground",
  info: "bg-info-subtle text-info-foreground",
  danger: "bg-destructive-subtle text-destructive-foreground",
};

/**
 * Reproduce a deterministic experiment in the visitor's browser with the same code that
 * produced the reference result. Runs on the main thread (each harness takes milliseconds),
 * sends no request and keeps attempts only in this component's state.
 */
export function ExperimentReplay({ kind, reference }: { kind: ReplayKind; reference: ReplayOutcome }) {
  const spec = replaySpecs[kind];
  const [seedText, setSeedText] = useState(String(spec.defaultSeed));
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const latest = attempts[0];
  const [min, max] = spec.seedRange;

  const run = (event: FormEvent) => {
    event.preventDefault();
    if (phase.kind === "running") return;
    const seed = Number(seedText);
    if (!Number.isInteger(seed) || seed < min || seed > max) {
      setPhase({ kind: "error", message: `种子必须是 ${min}–${max.toLocaleString("en-US")} 之间的整数。` });
      return;
    }
    setPhase({ kind: "running" });
    // Let the "running" state paint before the synchronous computation starts.
    timer.current = window.setTimeout(() => {
      try {
        const started = performance.now();
        const outcome = runReplay(kind, seed);
        const ms = performance.now() - started;
        const comparison = seed === spec.defaultSeed ? compareOutcomes(reference, outcome) : undefined;
        setAttempts((previous) => [{ n: (previous[0]?.n ?? 0) + 1, seed, ms, outcome, comparison }, ...previous].slice(0, 20));
        setPhase({ kind: "idle" });
      } catch (error) {
        setPhase({ kind: "error", message: error instanceof Error ? `运行失败：${error.message}` : "运行失败。" });
      }
    }, 40);
  };

  const verdict = latest ? verdictText(latest) : undefined;

  return (
    <div className="rounded-card bg-surface p-5 min-[640px]:p-6">
      <div className="flex flex-col gap-5 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <p className="max-w-[34rem] text-[.875rem] leading-6 text-muted-foreground">
          在你的浏览器中运行与参考结果相同的代码。不发送任何请求，结果只保存在当前页面。换一个种子，可以检验判定在其他输入上是否仍然成立。
        </p>
        <form className="flex flex-wrap items-end gap-2" onSubmit={run}>
          <label className="grid gap-1">
            <span className="text-caption">种子</span>
            <input
              className="premium-field h-11 w-32 px-4 font-code text-sm tabular-nums"
              inputMode="numeric"
              max={max}
              min={min}
              onChange={(event) => setSeedText(event.target.value)}
              step={1}
              type="number"
              value={seedText}
            />
          </label>
          <Button loading={phase.kind === "running"} type="submit"><Play aria-hidden="true" className="size-4" />在本机运行</Button>
          {seedText !== String(spec.defaultSeed) ? (
            <Button onClick={() => setSeedText(String(spec.defaultSeed))} type="button" variant="ghost"><RotateCcw aria-hidden="true" className="size-4" />参考种子 {spec.defaultSeed}</Button>
          ) : null}
        </form>
      </div>

      <div aria-live="polite" className="mt-6">
        {phase.kind === "running" ? <p className="text-caption">正在运行…</p> : null}
        {phase.kind === "error" ? <p className="text-[.8125rem] text-destructive-foreground">{phase.message}</p> : null}
        {phase.kind !== "running" && !latest && phase.kind !== "error" ? <p className="text-caption">尚未运行。参考种子为 {spec.defaultSeed}；用参考种子运行时会与上方的参考结果逐项比对。</p> : null}
        {latest && verdict ? (
          <div className={cn("space-y-5", phase.kind === "running" && "opacity-50 transition-opacity")}>
            <div className={cn("rounded-[.75rem] px-4 py-3", bannerTone[verdict.tone])}>
              <p className="text-[.875rem] font-medium">第 {latest.n} 次复现 · {verdict.title}</p>
              <p className="mt-0.5 text-[.8125rem] leading-5">{verdict.detail}</p>
            </div>
            <ResultTable caption={`本机复现结果，种子 ${latest.seed}`} comparison={latest.comparison} outcome={latest.outcome} />
            <CheckList checks={latest.outcome.checks} />
            <p className="text-caption">种子 {latest.seed} · 本机耗时 {latest.ms.toFixed(1)} ms（取决于设备，仅供参考，不是性能结论）</p>
          </div>
        ) : null}
      </div>

      {attempts.length > 1 ? (
        <details className="mt-6 border-t border-border/12 pt-4">
          <summary className="cursor-pointer text-[.8125rem] font-medium">本页会话中的复现（{attempts.length}）</summary>
          <ol className="mt-3 space-y-1.5 text-[.75rem] text-muted-foreground">
            {attempts.map((attempt) => {
              const text = verdictText(attempt);
              return <li className="font-code tabular-nums" key={attempt.n}>#{attempt.n} · 种子 {attempt.seed} · {text.title} · {attempt.ms.toFixed(1)} ms</li>;
            })}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
