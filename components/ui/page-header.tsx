import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Page and section headers in the platform's editorial voice: a "label ↓" kicker, a
 * large tight title and quiet supporting copy. Every existing workspace page uses these,
 * so they carry the landing page's rhythm without any page-level rewrite.
 */

const d = (ms: number) => ({ "--d": ms }) as CSSProperties;

export function PageHeader({ eyebrow, title, description, back, primaryAction, secondaryAction, className }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; back?: ReactNode; primaryAction?: ReactNode; secondaryAction?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex min-w-0 flex-col gap-6 pb-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 max-w-[52rem]">
        {back ? <div className="enter mb-5">{back}</div> : null}
        {eyebrow ? <div className="enter kicker mb-3">{eyebrow}<span aria-hidden="true" className="kicker__arrow">↓</span></div> : null}
        <h1 className="enter overflow-wrap-anywhere text-balance text-[clamp(2.1rem,4.4vw,3.9rem)] font-medium leading-[1.05] tracking-[-.04em]" style={d(80)}>{title}</h1>
        {description ? <div className="enter mt-4 max-w-[42rem] overflow-wrap-anywhere text-[.9375rem] leading-7 text-muted-foreground" style={d(200)}>{description}</div> : null}
      </div>
      {primaryAction || secondaryAction ? <div className="enter flex w-full min-w-0 flex-wrap gap-2 [&>*]:min-h-11 max-[359px]:[&>*]:w-full sm:w-auto sm:shrink-0 sm:justify-end" style={d(280)}>{secondaryAction}{primaryAction}</div> : null}
    </header>
  );
}

export function SectionHeader({ title, description, action, className, id, kicker }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; id?: string; kicker?: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 items-end justify-between gap-4 border-b border-border/10 pb-3", className)}>
      <div className="min-w-0">
        {kicker ? <div className="kicker mb-1.5 text-muted-foreground">{kicker}<span aria-hidden="true" className="kicker__arrow">↓</span></div> : null}
        <h2 className="text-[clamp(1.35rem,2vw,1.75rem)] font-medium leading-tight tracking-[-.03em]" id={id}>{title}</h2>
        {description ? <div className="mt-1.5 text-supporting">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
