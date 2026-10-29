import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DemoBadge, StatusBadge } from "@/features/platform-preview/components/status-badge";
import type { PreviewModule } from "@/features/platform-preview/navigation";
import type { CapabilityStatus } from "@/features/platform-preview/status";

/** Editorial page header used by every preview page (same rhythm as the workspace home). */
export function PreviewHeader({
  module, status, title, description, actions, back,
}: {
  module?: PreviewModule; status?: CapabilityStatus; title: ReactNode; description: ReactNode; actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  const shown = status ?? module?.status;
  return (
    <section className="flex flex-col gap-6 pb-10 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between min-[1024px]:pb-12">
      <div className="min-w-0 max-w-[48rem]">
        {back ? (
          <Link className="group mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" href={back.href} prefetch={false}>
            <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-0.5" />{back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {module ? <p className="text-[.8125rem] font-medium">{module.name} · {module.label}<span aria-hidden="true" className="ml-1.5 text-muted-foreground">↓</span></p> : null}
          {shown ? <StatusBadge status={shown} /> : null}
          <DemoBadge />
        </div>
        <h1 className="mt-4 text-balance text-[clamp(2.125rem,4.4vw,4.25rem)] font-medium leading-[1.04] tracking-[-.04em]">{title}</h1>
        <div className="mt-5 max-w-[40rem] text-body text-muted-foreground">{description}</div>
      </div>
      {actions || module?.realHref ? (
        <div className="flex flex-col gap-2 min-[521px]:flex-row min-[1024px]:shrink-0">
          {actions}
          {module?.realHref && module.status === "live" ? (
            <Button asChild size="lg" variant="outline"><Link href={module.realHref} prefetch={false}>打开真实功能<ArrowUpRight className="size-4" /></Link></Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Small "label ↓" heading above each block, as on the landing page and workspace home. */
export function BlockLabel({ children, action, id, meta }: { children: ReactNode; action?: ReactNode; id?: string; meta?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-[.8125rem] font-medium" id={id}>{children}<span aria-hidden="true" className="text-muted-foreground">↓</span></h2>
        {meta}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card bg-surface p-4 min-[821px]:p-5 ${className}`}>{children}</div>;
}

/** Key/value row list used in detail panels. */
export function FactList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="border-t border-border/14">
      {rows.map(([key, value]) => (
        <div className="grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)] gap-4 border-b border-border/14 py-3 text-sm" key={key}>
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="min-w-0 break-words text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
