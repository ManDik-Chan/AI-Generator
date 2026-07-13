"use client";

import { Check, LoaderCircle, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatElapsedTime } from "@/components/ai/use-elapsed-time";

export interface GenerationStage { id: string; label: string; detail?: string }

export function GenerationProgress({ title, stages, activeStage, elapsedSeconds, onCancel }: { title: string; stages: GenerationStage[]; activeStage: string; elapsedSeconds: number; onCancel?(): void }) {
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === activeStage));
  const current = stages[activeIndex];
  return <div aria-live="polite" className="premium-subpanel p-4 sm:p-5" role="status">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="premium-kicker">LIVE PROGRESS</p><h3 className="mt-1 font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{formatElapsedTime(elapsedSeconds)} · 生成完成前请保持页面开启</p></div>{onCancel && <Button onClick={onCancel} size="sm" type="button" variant="outline"><Square className="size-3.5 fill-current" />取消生成</Button>}</div>
    <div className="my-4 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
    <ol className="space-y-3">{stages.map((stage, index) => <li className={index > activeIndex ? "flex gap-3 text-muted-foreground/60" : "flex gap-3"} key={stage.id}>{index < activeIndex ? <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span> : index === activeIndex ? <LoaderCircle className="size-6 shrink-0 animate-spin text-primary" /> : <span className="mt-1 size-4 shrink-0 rounded-full border border-border/20" />}<span><span className="block text-sm font-medium">{stage.label}</span>{stage.detail && <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{stage.detail}</span>}</span></li>)}</ol>
    {current?.detail && <p className="mt-4 rounded-control bg-surface-raised p-3 text-xs leading-5 text-muted-foreground">{current.detail}</p>}
  </div>;
}
