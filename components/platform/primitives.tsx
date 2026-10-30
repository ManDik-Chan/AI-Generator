import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import type { Tone } from "@/features/platform/labels";
import { DEMO_STATE_LABEL, SAMPLE_LABEL, statusMeta, type CapabilityStatus } from "@/features/platform/status";
import { cn } from "@/lib/utils";

/* Shared editorial primitives for the platform. Server-safe: no hooks. */

export const delay = (ms: number) => ({ "--d": ms }) as CSSProperties;

/** "Label ↓" kicker, the landing page's section marker. */
export function Kicker({ children, as: Tag = "p", id, className }: { children: ReactNode; as?: "p" | "h2" | "h3" | "span"; id?: string; className?: string }) {
  return (
    <Tag className={cn("kicker", className)} id={id}>
      {children}
      <span aria-hidden="true" className="kicker__arrow">↓</span>
    </Tag>
  );
}

/** An arrow that slides out and back in when its link or group is hovered. */
export function LoopArrow({ dir = "right", className }: { dir?: "right" | "ur"; className?: string }) {
  const Icon = dir === "ur" ? ArrowUpRight : ArrowRight;
  return (
    <span aria-hidden="true" className={cn("loop-ic", dir === "ur" && "loop-ic--ur", className)}>
      <Icon className="size-[1em]" />
      <Icon className="size-[1em]" />
    </span>
  );
}

/** Text link with growing underline and looping arrow. */
export function ArrowLink({ href, children, className, external = false }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  const content = (
    <>
      <span className="link-grow">{children}</span>
      <LoopArrow dir={external ? "ur" : "right"} className="text-[.95em]" />
    </>
  );
  const classes = cn("group inline-flex items-center gap-1.5 text-[.8125rem] font-medium", className);
  if (external) return <a className={classes} href={href} rel="noopener noreferrer" target="_blank">{content}</a>;
  return <Link className={classes} href={href} prefetch={false}>{content}</Link>;
}

/** Big editorial page title: lines slide up, copy rises after them. */
export function PageIntro({
  kicker,
  meta,
  title,
  description,
  actions,
  className,
}: {
  kicker: ReactNode;
  meta?: ReactNode;
  title: string | string[];
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const lines = Array.isArray(title) ? title : [title];
  return (
    <header className={cn("flex flex-col gap-8 pb-10 pt-2 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between min-[1024px]:pb-14 min-[1024px]:pt-4", className)}>
      <div className="min-w-0 max-w-[54rem]">
        <div className="enter flex flex-wrap items-center gap-2">
          <Kicker>{kicker}</Kicker>
          {meta}
        </div>
        <h1 className="mt-4 text-balance text-[clamp(2.35rem,5vw,4.6rem)] font-medium leading-[1.04] tracking-[-.04em]">
          {lines.map((line, index) => (
            <span className="title-line" key={index} style={delay(index * 90)}><span>{line}</span></span>
          ))}
        </h1>
        {description ? <div className="enter mt-5 max-w-[40rem] text-[.9375rem] leading-7 text-muted-foreground" style={delay(260)}>{description}</div> : null}
      </div>
      {actions ? <div className="enter flex flex-col gap-2 min-[521px]:flex-row min-[1024px]:shrink-0" style={delay(340)}>{actions}</div> : null}
    </header>
  );
}

/** Kicker heading for a block, with optional meta and a right-hand action. */
export function SectionHead({ id, children, meta, action, className }: { id?: string; children: ReactNode; meta?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Kicker as="h2" id={id}>{children}</Kicker>
        {meta}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const toneClasses: Record<Tone, string> = {
  ink: "bg-foreground text-background",
  lime: "bg-lime text-[hsl(var(--ink))]",
  success: "bg-success-subtle text-success-foreground",
  warning: "bg-warning-subtle text-warning-foreground",
  danger: "bg-destructive-subtle text-destructive-foreground",
  info: "bg-info-subtle text-info-foreground",
  neutral: "border border-border/14 text-muted-foreground",
};

export function ToneBadge({ tone, children, className, dot = false }: { tone: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[.6875rem] font-medium leading-5", toneClasses[tone], className)}>
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  );
}

const statusTone: Record<CapabilityStatus, Tone> = { live: "success", dev: "warning", planned: "neutral" };

export function StatusPill({ status, className }: { status: CapabilityStatus; className?: string }) {
  return <ToneBadge className={className} dot tone={statusTone[status]}>{statusMeta[status].label}</ToneBadge>;
}

/** Marks hand-written sample records. */
export function SampleTag({ className, children = SAMPLE_LABEL }: { className?: string; children?: ReactNode }) {
  return <span className={cn("demo-outline inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[.6875rem] leading-5 text-muted-foreground", className)}>{children}</span>;
}

/** Explains that a module's backend is not deployed: the UI works, nothing is saved. */
export function DemoNotice({ children, action, className, label = DEMO_STATE_LABEL }: { children: ReactNode; action?: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn("demo-outline flex flex-col gap-2 rounded-card px-4 py-3 text-xs leading-5 text-muted-foreground min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between", className)} role="note">
      <p className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-[.45rem] size-1.5 shrink-0 rounded-full bg-warning" />
        <span><b className="font-medium text-foreground">{label}</b> · {children}</span>
      </p>
      {action ? <div className="shrink-0 text-foreground">{action}</div> : null}
    </div>
  );
}

/** Hairline key / value row. */
export function SpecRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("spec-row", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-[.8125rem] font-medium">{children}</dd>
    </div>
  );
}

/** Dashed empty block with one line of explanation and an optional action. */
export function EmptyBlock({ title, children, action, className }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-dashed border-foreground/18 px-5 py-10 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1.5 max-w-md text-caption">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Large tabular number used for counts. */
export function BigNumber({ value, className }: { value: number | string; className?: string }) {
  return <span className={cn("text-[clamp(2.25rem,3.6vw,3.25rem)] font-medium leading-none tracking-[-.045em] tabular-nums", className)}>{value}</span>;
}
