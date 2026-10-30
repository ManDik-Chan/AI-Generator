"use client";

import { useId, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { runStatusMeta } from "@/features/platform/labels";
import type { RunStatus } from "@/features/platform/types";
import { cn } from "@/lib/utils";

/* Controls and read-outs shared by the two demo workbenches. */

export function Panel({ title, meta, children, className, tone = "surface" }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; tone?: "surface" | "ink" }) {
  return (
    <section className={cn("min-w-0 rounded-card", tone === "ink" ? "bg-[hsl(var(--ink))] text-[hsl(var(--paper))]" : "bg-surface", className)}>
      {title ? (
        <header className={cn("flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2.5", tone === "ink" ? "border-[hsl(var(--paper)/.12)]" : "border-border/10")}>
          <h2 className="text-[.8125rem] font-medium">{title}</h2>
          {meta ? <div className={cn("text-[.6875rem]", tone === "ink" ? "text-[hsl(var(--paper)/.6)]" : "text-muted-foreground")}>{meta}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, disabled, columns }: { label: string; value: T; options: readonly { value: NoInfer<T>; label: string; hint?: string }[]; onChange(value: NoInfer<T>): void; disabled?: boolean; columns?: number }) {
  return (
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-60">
      <legend className="text-[.75rem] text-muted-foreground">{label}</legend>
      <div className={cn("mt-2 gap-1", columns ? "grid" : "flex flex-wrap")} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={cn(
              "min-h-9 rounded-full px-3 py-1.5 text-[.75rem] transition-colors duration-300",
              value === option.value ? "bg-foreground text-background" : "border border-border/14 hover:border-foreground/30",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.hint}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format, disabled, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange(value: number): void; format?: (value: number) => string; disabled?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className={cn(disabled && "opacity-60")}>
      <div className="flex items-center justify-between gap-3 text-[.75rem]">
        <label className="text-muted-foreground" htmlFor={id}>{label}</label>
        <span className="font-code tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-2 h-6 w-full accent-[hsl(var(--foreground))]"
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      {hint ? <p className="mt-1 text-[.6875rem] leading-4 text-muted-foreground" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

export function Metric({ label, value, unit, hint, emphasis = false }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className="min-w-0 bg-surface p-4">
      <p className="text-[.6875rem] text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 truncate font-medium leading-none tracking-[-.03em] tabular-nums", emphasis ? "text-[clamp(1.75rem,2.6vw,2.4rem)]" : "text-[1.375rem]")}>
        {value}
        {unit ? <span className="ml-1 text-[.75rem] font-normal tracking-normal text-muted-foreground">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1.5 text-[.6875rem] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const LIFECYCLE: RunStatus[] = ["PENDING", "ACCEPTED", "RUNNING"];

/** PENDING → ACCEPTED → RUNNING → terminal, with the time each state was reached. */
export function RunTimeline({ transitions, className }: { transitions: { status: RunStatus; at: string }[]; className?: string }) {
  const start = transitions[0] ? Date.parse(transitions[0].at) : 0;
  const reached = new Map(transitions.map((item) => [item.status, Date.parse(item.at) - start]));
  const terminal = transitions.find((item) => runStatusMeta[item.status].terminal);
  const steps: { status: RunStatus; done: boolean }[] = [...LIFECYCLE.map((status) => ({ status, done: reached.has(status) })), { status: terminal?.status ?? "SUCCEEDED", done: Boolean(terminal) }];
  return (
    <ol aria-label="运行状态" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {steps.map((step, index) => {
        const ms = reached.get(step.status);
        const isTerminal = index === steps.length - 1;
        return (
          <li className="flex items-center gap-1.5" key={`${step.status}-${index}`}>
            {step.done ? (
              <ToneBadge dot tone={isTerminal ? runStatusMeta[step.status].tone : "ink"}>
                <span className="font-code">{step.status}</span>
                {ms !== undefined ? <span className="font-code opacity-60">+{ms}ms</span> : null}
              </ToneBadge>
            ) : (
              <span className="rounded-full border border-dashed border-border/25 px-2 py-0.5 font-code text-[.6875rem] leading-5 text-muted-foreground/70">{isTerminal ? "终态" : step.status}</span>
            )}
            {index < steps.length - 1 ? <span aria-hidden="true" className="text-[.6875rem] text-muted-foreground/60">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={copied ? "已复制" : "复制"}
      className={cn("inline-flex size-8 items-center justify-center rounded-full text-[hsl(var(--paper)/.7)] transition-colors hover:bg-[hsl(var(--paper)/.1)] hover:text-[hsl(var(--paper))]", className)}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }, () => {});
      }}
      type="button"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** Dark code panel with tabs: request, response, events, curl… */
export function CodeTabs({ tabs, label, empty }: { tabs: { id: string; label: string; code: string; language?: string }[]; label: string; empty?: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const base = useId();
  return (
    <div className="flex min-h-[18rem] min-w-0 flex-col overflow-hidden rounded-card bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
      <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--paper)/.12)] pl-2 pr-1.5">
        <div aria-label={label} className="scroll-x flex min-w-0" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={`${base}-${tab.id}`}
              aria-selected={tab.id === current?.id}
              className={cn("h-11 shrink-0 px-3 font-code text-[.75rem] transition-colors", tab.id === current?.id ? "text-[hsl(var(--lime))]" : "text-[hsl(var(--paper)/.55)] hover:text-[hsl(var(--paper))]")}
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        {current?.code ? <CopyButton text={current.code} /> : null}
      </div>
      <pre className="premium-scrollbar max-h-[26rem] flex-1 overflow-auto p-4 font-code text-[.6875rem] leading-5 text-[hsl(var(--paper)/.85)]" id={current ? `${base}-${current.id}` : undefined} role="tabpanel" tabIndex={0}>
        {current?.code || <span className="text-[hsl(var(--paper)/.45)]">{empty ?? "还没有内容。"}</span>}
      </pre>
    </div>
  );
}

export interface Series {
  label: string;
  points: { x: number; y: number }[];
  className: string;
}

/** Minimal responsive line chart; y starts at the smallest value so small changes stay visible. */
export function LineChart({ series, height = 140, label, xLabel, yFormat = (v) => v.toFixed(2) }: { series: Series[]; height?: number; label: string; xLabel?: string; yFormat?: (value: number) => string }) {
  const all = series.flatMap((item) => item.points);
  const width = 600;
  const pad = { l: 4, r: 4, t: 10, b: 10 };
  if (all.length < 2) {
    return <div className="grid place-items-center text-[.75rem] text-muted-foreground" style={{ height }}>运行后显示曲线</div>;
  }
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y).filter(Number.isFinite);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y1 - y0 < 1e-9) {
    y0 -= 1;
    y1 += 1;
  }
  const sx = (x: number) => pad.l + ((x - x0) / Math.max(1e-9, x1 - x0)) * (width - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (height - pad.t - pad.b);
  return (
    <figure className="min-w-0">
      <svg aria-label={label} className="block h-auto w-full overflow-visible" preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75].map((f) => <line className="stroke-border/10" key={f} vectorEffect="non-scaling-stroke" x1={0} x2={width} y1={pad.t + f * (height - pad.t - pad.b)} y2={pad.t + f * (height - pad.t - pad.b)} />)}
        {series.map((item) => (
          <polyline className={cn("fill-none", item.className)} key={item.label} points={item.points.filter((p) => Number.isFinite(p.y)).map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ")} strokeLinejoin="round" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[.6875rem] text-muted-foreground">
        <span className="flex flex-wrap gap-3">
          {series.map((item) => (
            <span className="inline-flex items-center gap-1.5" key={item.label}><svg aria-hidden="true" className="size-3" viewBox="0 0 12 12"><line className={item.className} strokeWidth={3} x1={0} x2={12} y1={6} y2={6} /></svg>{item.label}</span>
          ))}
        </span>
        <span className="font-code">{yFormat(y0)} – {yFormat(y1)}{xLabel ? ` · ${xLabel}` : ""}</span>
      </figcaption>
    </figure>
  );
}
