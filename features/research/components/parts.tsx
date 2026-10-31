import Link from "next/link";
import { ArrowUpRight, BookOpen, ChevronRight, Cpu, FileCode2, MonitorSmartphone, Package, Server, TestTubeDiagonal } from "lucide-react";
import type { ReactNode } from "react";

import { DemoNotice, ToneBadge } from "@/components/platform/primitives";
import { claimMeta } from "@/features/platform/labels";
import type { ClaimStatus } from "@/features/platform/types";
import { availabilityMeta, evidenceKindMeta, experimentStatusMeta, RESEARCH_FIXTURE_LABEL, siteMeta } from "@/features/research/labels";
import { requirements, type RequirementId } from "@/features/research/requirements";
import { repoFileUrl } from "@/features/research/source";
import type { EvidenceItem, EvidenceKind, ExecutionSite, ExperimentStatus } from "@/features/research/types";
import { cn } from "@/lib/utils";

/* Server-rendered building blocks of the Research Lab pages. */

export function ExperimentStatusBadge({ status, className }: { status: ExperimentStatus; className?: string }) {
  const meta = experimentStatusMeta[status];
  return <ToneBadge className={className} dot tone={meta.tone}>{meta.label}</ToneBadge>;
}

export function ClaimStatusBadge({ status, className }: { status: ClaimStatus; className?: string }) {
  return <ToneBadge className={className} tone={claimMeta[status].tone}>{claimMeta[status].label}</ToneBadge>;
}

const siteIcon: Record<ExecutionSite, typeof Server> = { browser: MonitorSmartphone, ci: TestTubeDiagonal, server: Server, gpu: Cpu };

export function SiteLabel({ site, className }: { site: ExecutionSite; className?: string }) {
  const Icon = siteIcon[site];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[.75rem] text-muted-foreground", className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />{siteMeta[site].label}
    </span>
  );
}

export const evidenceIcon: Record<EvidenceKind, typeof Server> = { source: FileCode2, test: TestTubeDiagonal, doc: BookOpen, asset: Package };

function evidenceTarget(item: EvidenceItem): { href: string; external: boolean } | undefined {
  if (item.availability !== "open" || !item.ref) return undefined;
  if (item.kind === "doc") return { href: item.ref, external: false };
  return { href: repoFileUrl(item.ref), external: true };
}

export function EvidenceList({ items, empty, className }: { items: EvidenceItem[]; empty: ReactNode; className?: string }) {
  if (!items.length) return <p className={cn("text-[.8125rem] leading-6 text-muted-foreground", className)}>{empty}</p>;
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item, index) => {
        const Icon = evidenceIcon[item.kind];
        const target = evidenceTarget(item);
        const label = <span className="text-[.8125rem] font-medium leading-5">{item.label}</span>;
        return (
          <li className="flex gap-2.5" key={`${item.kind}-${item.label}-${index}`}>
            <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              {target ? (
                target.external
                  ? <a className="group inline-flex items-start gap-1" href={target.href} rel="noopener noreferrer" target="_blank"><span className="link-grow">{label}</span><ArrowUpRight aria-hidden="true" className="mt-1 size-3 shrink-0 text-muted-foreground" /></a>
                  : <Link className="group inline-flex items-start gap-1" href={target.href} prefetch={false}><span className="link-grow">{label}</span><ArrowUpRight aria-hidden="true" className="mt-1 size-3 shrink-0 text-muted-foreground" /></Link>
              ) : label}
              <span className="mt-0.5 block text-[.6875rem] leading-4 text-muted-foreground">
                {evidenceKindMeta[item.kind].label}
                {item.ref ? <> · <span className="break-all font-code">{item.ref}</span></> : null}
                {item.availability !== "open" ? <> · {availabilityMeta[item.availability].label}</> : null}
              </span>
              {item.note ? <span className="mt-1 block text-[.6875rem] leading-4 text-muted-foreground">{item.note}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function RequirementList({ ids, className }: { ids: RequirementId[]; className?: string }) {
  return (
    <ul className={cn("border-t border-border/12", className)}>
      {ids.map((id) => (
        <li className="grid gap-x-4 gap-y-1 border-b border-border/12 py-3 min-[640px]:grid-cols-[3.25rem_minmax(0,1fr)]" key={id}>
          <span className="font-code text-[.75rem] font-medium">{id}</span>
          <span>
            <span className="text-[.8125rem] font-medium">{requirements[id].title}</span>
            <span className="mt-0.5 block text-[.8125rem] leading-5 text-muted-foreground">{requirements[id].detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="位置" className="enter">
      <ol className="flex flex-wrap items-center gap-1 text-[.75rem] text-muted-foreground">
        {trail.map((step, index) => (
          <li className="inline-flex items-center gap-1" key={`${step.label}-${index}`}>
            {index > 0 ? <ChevronRight aria-hidden="true" className="size-3" /> : null}
            {step.href
              ? <Link className="link-grow transition-colors duration-300 hover:text-foreground" href={step.href} prefetch={false}>{step.label}</Link>
              : <span aria-current="page" className={cn("text-foreground", /^[A-Z]+-\d+$/.test(step.label) && "font-code")}>{step.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ResearchFixtureNotice({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <DemoNotice className={className} label={RESEARCH_FIXTURE_LABEL}>
      {children ?? "研究项目、声明映射与实验协议是写在仓库里的本地演示数据，没有读取 Registry 或任何内部数据。标为「可本地复现」的结果不是手写的：页面构建时运行仓库代码得到参考结果，你可以在浏览器中用同一份代码重算核对。"}
    </DemoNotice>
  );
}

const claimToneBar: Record<ClaimStatus, string> = {
  EXPERIMENT_VERIFIED: "bg-success",
  SOURCE_IMPLEMENTED: "bg-info",
  DOCUMENTED: "bg-warning",
  PLANNED: "bg-transparent shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.28)]",
};

const claimOrder: ClaimStatus[] = ["EXPERIMENT_VERIFIED", "SOURCE_IMPLEMENTED", "DOCUMENTED", "PLANNED"];

/**
 * One segment per claim, coloured by evidence level: how much of a project rests on what.
 * Decorative; always pair it with ClaimLegend, which carries the same information as text.
 */
export function ClaimSpectrum({ statuses, className }: { statuses: ClaimStatus[]; className?: string }) {
  const sorted = [...statuses].sort((a, b) => claimOrder.indexOf(a) - claimOrder.indexOf(b));
  return (
    <span aria-hidden="true" className={cn("flex h-2 gap-0.5", className)}>
      {sorted.map((status, index) => <span className={cn("min-w-0 flex-1 rounded-full", claimToneBar[status])} key={index} />)}
    </span>
  );
}

export function ClaimLegend({ statuses, className }: { statuses: ClaimStatus[]; className?: string }) {
  return (
    <span className={cn("flex flex-wrap gap-x-3 gap-y-1 text-[.6875rem] text-muted-foreground", className)}>
      <span className="sr-only">声明的证据等级：</span>
      {claimOrder.filter((status) => statuses.includes(status)).map((status) => (
        <span className="inline-flex items-center gap-1.5" key={status}>
          <span aria-hidden="true" className={cn("size-2 rounded-full", claimToneBar[status])} />
          {claimMeta[status].label} {statuses.filter((item) => item === status).length}
        </span>
      ))}
    </span>
  );
}
