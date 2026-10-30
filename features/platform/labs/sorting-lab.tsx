"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Shuffle, StepForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { algorithms, distributions, makeInput, runSort, type Algorithm, type Distribution } from "@/features/platform/sorting";
import { cn } from "@/lib/utils";

const N = 32;

/** Real sorting runs in the browser: every bar move and comparison count comes from the code. */
export function SortingLab() {
  const [algorithm, setAlgorithm] = useState<Algorithm>("quick");
  const [distribution, setDistribution] = useState<Distribution>("random");
  const [seed, setSeed] = useState(2026);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const timer = useRef<number | undefined>(undefined);

  const input = useMemo(() => makeInput(distribution, N, seed), [distribution, seed]);
  const run = useMemo(() => runSort(algorithm, input, true), [algorithm, input]);
  const totals = useMemo(() => algorithms.map((item) => ({ ...item, comparisons: runSort(item.key, input).comparisons })), [input]);
  const steps = run.steps;
  const current = steps[Math.min(step, steps.length - 1)];
  const values = step === 0 || !current ? input : current.snapshot;
  const done = step >= steps.length;
  const comparisonsSoFar = useMemo(() => steps.slice(0, step).filter((item) => item.kind === "compare").length, [steps, step]);

  useEffect(() => { setStep(0); setPlaying(false); }, [algorithm, distribution, seed]);
  useEffect(() => {
    if (!playing) return;
    if (done) { setPlaying(false); return; }
    timer.current = window.setTimeout(() => setStep((value) => Math.min(steps.length, value + speed)), 30);
    return () => window.clearTimeout(timer.current);
  }, [playing, step, done, speed, steps.length]);

  const togglePlay = () => {
    if (done) {
      setStep(0);
      setPlaying(true);
      return;
    }
    setPlaying((value) => !value);
  };

  const max = Math.max(...input);
  const highlight = !done && step > 0 ? current : undefined;

  return (
    <div className="overflow-hidden rounded-card bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/10 px-4 py-3">
        <p className="text-[.8125rem] font-medium">实验室 · 排序过程</p>
        <p className="flex items-center gap-2 text-[.6875rem] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />在你的浏览器中真实运行 · 不经过服务器</p>
      </div>
      <div className="grid gap-px bg-border/10 min-[1024px]:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
        <div className="bg-surface p-4">
          <div aria-label={`${N} 个数的${algorithms.find((item) => item.key === algorithm)?.label}过程`} className="flex h-[16rem] items-end gap-[3px] min-[640px]:h-[20rem]" role="img">
            {values.map((value, index) => (
              <span
                className={cn(
                  "flex-1 rounded-t-[2px] transition-[height,background-color] duration-150",
                  highlight && (index === highlight.a || index === highlight.b)
                    ? highlight.kind === "compare" ? "bg-lime" : "bg-primary"
                    : done ? "bg-foreground" : "bg-foreground/70",
                )}
                key={index}
                style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={togglePlay} size="sm">
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{playing ? "暂停" : done ? "重新播放" : "播放"}
            </Button>
            <Button disabled={playing || done} onClick={() => setStep((value) => Math.min(steps.length, value + 1))} size="sm" variant="outline"><StepForward className="size-3.5" />单步</Button>
            <Button onClick={() => { setStep(0); setPlaying(false); }} size="sm" variant="ghost"><RotateCcw className="size-3.5" />重置</Button>
            <label className="ml-auto flex items-center gap-2 text-[.75rem] text-muted-foreground" htmlFor="sl-speed">速度
              <input className="w-24 accent-[hsl(var(--foreground))]" id="sl-speed" max={12} min={1} onChange={(event) => setSpeed(Number(event.target.value))} type="range" value={speed} />
            </label>
          </div>
        </div>
        <div className="space-y-5 bg-surface p-4">
          <fieldset>
            <legend className="text-[.75rem] text-muted-foreground">算法</legend>
            <div className="mt-2 grid gap-1">
              {algorithms.map((item) => (
                <button aria-pressed={algorithm === item.key} className={cn("flex items-center justify-between gap-2 rounded-full px-3 py-2 text-left text-[.8125rem] transition-colors duration-300", algorithm === item.key ? "bg-foreground text-background" : "bg-surface-raised hover:bg-surface-muted")} key={item.key} onClick={() => setAlgorithm(item.key)} type="button">
                  <span>{item.label}</span><span className="font-code text-[.6875rem] opacity-70">{item.complexity}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-[.75rem] text-muted-foreground">输入分布</legend>
            <div className="mt-2 flex flex-wrap gap-1">
              {distributions.map((item) => (
                <button aria-pressed={distribution === item.key} className={cn("rounded-full px-3 py-1.5 text-[.75rem] transition-colors duration-300", distribution === item.key ? "bg-foreground text-background" : "border border-border/14 hover:border-foreground/30")} key={item.key} onClick={() => setDistribution(item.key)} type="button">{item.label}</button>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-2 text-[.75rem]">
            <span className="text-muted-foreground">种子 <span className="font-code text-foreground">{seed}</span></span>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border/14 px-3 py-1.5 hover:border-foreground/30" onClick={() => setSeed((value) => (value * 48271) % 2147483647)} type="button"><Shuffle className="size-3.5" />换一组</button>
          </div>
          <div className="border-t border-border/12 pt-4" aria-live="polite">
            <p className="text-[.75rem] text-muted-foreground">本次比较次数</p>
            <p className="mt-1 text-[2.5rem] font-medium leading-none tracking-[-.04em] tabular-nums">{comparisonsSoFar}<span className="ml-1 text-sm text-muted-foreground">/ {run.comparisons}</span></p>
            <ul className="mt-4 space-y-1.5">
              {totals.map((item) => {
                const best = item.comparisons === Math.min(...totals.map((total) => total.comparisons));
                return (
                  <li className="flex items-center gap-2 text-[.75rem]" key={item.key}>
                    <span className="w-28 shrink-0 truncate text-muted-foreground">{item.label.replace("（三数取中）", "")}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"><span className={cn("block h-full rounded-full", best ? "bg-lime" : "bg-foreground/60")} style={{ width: `${(item.comparisons / Math.max(...totals.map((total) => total.comparisons))) * 100}%` }} /></span>
                    <span className="w-10 text-right font-code tabular-nums">{item.comparisons}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
