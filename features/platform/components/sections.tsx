import { ArrowUpRight, FileText } from "lucide-react";

import { EmptyBlock, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { claimMeta, dataFlowMeta, formatVersion } from "@/features/platform/labels";
import { comparisonTable, algorithms } from "@/features/platform/sorting";
import type { PlatformProject } from "@/features/platform/types";
import { cn } from "@/lib/utils";

/* Read-only sections shared by the public showcase and the owner's project console. */

export function OverviewSections({ project }: { project: PlatformProject }) {
  return (
    <div className="grid gap-x-12 gap-y-10 min-[821px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <p className="text-[clamp(1.35rem,2.2vw,1.85rem)] font-medium leading-[1.25] tracking-[-.025em]">{project.summary}</p>
      <div className="grid gap-8 min-[640px]:grid-cols-2">
        {project.overview.map((section, index) => (
          <section className={cn("enter border-t border-border/14 pt-4", index === 0 && project.overview.length % 2 === 1 && "min-[640px]:col-span-2")} key={section.title} style={delay(80 + index * 60)}>
            <h3 className="text-[.8125rem] font-medium">{section.title}</h3>
            <p className="mt-2 text-[.9375rem] leading-7 text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export function CapabilityList({ project }: { project: PlatformProject }) {
  return (
    <section aria-labelledby={`caps-${project.slug}`}>
      <SectionHead id={`caps-${project.slug}`} meta={<span className="text-caption">每项能力单独授权</span>}>能力</SectionHead>
      <ul className="border-t border-border/12">
        {project.capabilities.map((capability) => (
          <li className="grid gap-x-6 gap-y-2 border-b border-border/12 py-4 min-[821px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto]" key={capability.id}>
            <div className="min-w-0">
              <p className="text-sm font-medium">{capability.label}</p>
              <p className="mt-1 font-code text-[.6875rem] text-muted-foreground">{capability.id}</p>
            </div>
            <div className="min-w-0 text-[.8125rem] leading-5 text-muted-foreground">
              {capability.detail}
              <span className="mt-1.5 flex items-center gap-1.5 text-[.75rem] text-foreground">
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", capability.dataFlow === "developer" ? "bg-warning" : capability.dataFlow === "platform" ? "bg-primary" : "bg-muted-foreground/50")} />
                {dataFlowMeta[capability.dataFlow].label}
              </span>
            </div>
            <div className="min-[821px]:text-right"><StatusPill status={capability.status} /></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClaimsList({ project }: { project: PlatformProject }) {
  if (!project.claims.length) return null;
  return (
    <section aria-labelledby={`claims-${project.slug}`}>
      <SectionHead id={`claims-${project.slug}`} meta={<span className="text-caption">如实标注每一条声明的证据等级</span>}>声明与证据</SectionHead>
      <ul className="grid gap-0.5 min-[640px]:grid-cols-2">
        {project.claims.map((claim) => (
          <li className="flex min-h-[8.5rem] flex-col rounded-card bg-surface p-4" key={claim.topic}>
            <ToneBadge className="self-start" tone={claimMeta[claim.status].tone}>{claimMeta[claim.status].label}</ToneBadge>
            <p className="mt-auto pt-6 text-sm font-medium">{claim.topic}</p>
            <p className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{claim.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ArchitectureDiagram({ project }: { project: PlatformProject }) {
  if (!project.architecture.length) return <EmptyBlock title="尚未提供架构说明">项目作者添加架构文档并通过审核后会显示在这里。</EmptyBlock>;
  return (
    <ol className="grid gap-0.5 min-[821px]:grid-flow-col min-[821px]:auto-cols-fr">
      {project.architecture.map((layer, index) => (
        <li className={cn("enter relative flex min-h-[15rem] flex-col rounded-card p-5", layer.planned ? "demo-outline bg-transparent" : "bg-surface")} key={layer.name} style={delay(60 + index * 70)}>
          <span className="flex items-center justify-between gap-3">
            <span className="font-code text-[.6875rem] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            {layer.planned ? <StatusPill status="planned" /> : null}
          </span>
          <h3 className="mt-6 text-[1.25rem] font-medium tracking-[-.02em]">{layer.name}</h3>
          <ul className="mt-4 space-y-2.5">
            {layer.items.map((item) => (
              <li className="flex gap-2 text-[.8125rem] leading-5 text-muted-foreground" key={item}>
                <span aria-hidden="true" className="mt-[.55rem] h-px w-3 shrink-0 bg-foreground/40" />{item}
              </li>
            ))}
          </ul>
          {index < project.architecture.length - 1 ? <span aria-hidden="true" className="absolute -right-[.4rem] top-1/2 z-[1] hidden size-3 -translate-y-1/2 rotate-45 border-r border-t border-foreground/30 bg-background min-[821px]:block" /> : null}
        </li>
      ))}
    </ol>
  );
}

const metricStatus = {
  UNPUBLISHED: { label: "未发布", tone: "neutral" as const },
  REPORTED: { label: "已报告", tone: "success" as const },
  COMPUTED_LIVE: { label: "浏览器内实时计算", tone: "lime" as const },
};

export function BenchmarksPanel({ project }: { project: PlatformProject }) {
  if (!project.benchmarks.length) return <EmptyBlock title="这个项目不发布基准">展示型项目可以不提供任何指标；平台不会为它生成数字。</EmptyBlock>;
  const live = project.lab === "sorting";
  const table = live ? comparisonTable(64, 2026) : [];
  return (
    <div className="space-y-10">
      <dl className="border-t border-border/12">
        {project.benchmarks.map((metric) => (
          <div className="grid gap-x-6 gap-y-1.5 border-b border-border/12 py-4 min-[821px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={metric.name}>
            <dt className="text-sm font-medium">{metric.name}</dt>
            <dd className="text-[.8125rem] leading-5 text-muted-foreground">{metric.dataset}{metric.note ? <span className="block">{metric.note}</span> : null}</dd>
            <dd className="min-[821px]:text-right"><ToneBadge tone={metricStatus[metric.status].tone}>{metricStatus[metric.status].label}</ToneBadge></dd>
          </div>
        ))}
      </dl>
      {live ? (
        <figure>
          <div className="scroll-x rounded-card bg-surface">
            <table className="w-full min-w-[34rem] border-collapse text-left text-[.8125rem]">
              <caption className="sr-only">比较次数：n = 64，种子 2026</caption>
              <thead>
                <tr className="border-b border-border/12 text-muted-foreground">
                  <th className="px-4 py-3 font-medium" scope="col">输入分布</th>
                  {algorithms.map((algorithm) => <th className="px-4 py-3 text-right font-medium" key={algorithm.key} scope="col">{algorithm.label}<span className="block font-code text-[.625rem] font-normal">{algorithm.complexity}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const min = Math.min(...row.counts);
                  return (
                    <tr className="border-b border-border/10 last:border-0" key={row.distribution.key}>
                      <th className="px-4 py-3 font-medium" scope="row">{row.distribution.label}</th>
                      {row.counts.map((count, index) => (
                        <td className={cn("px-4 py-3 text-right font-code tabular-nums", count === min ? "text-foreground" : "text-muted-foreground")} key={algorithms[index].key}>
                          {count === min ? <span className="rounded-full bg-lime px-2 py-0.5 text-[hsl(var(--ink))]">{count}</span> : count}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <figcaption className="mt-3 text-[.75rem] text-muted-foreground">比较次数 · n = 64 · 种子 2026。表格由本页的排序代码生成，与实验室使用同一实现；高亮为该分布下比较次数最少的算法。</figcaption>
        </figure>
      ) : null}
    </div>
  );
}

const docKind = { guide: "指南", reference: "参考", "model-card": "模型卡", data: "数据说明", changelog: "变更记录" } as const;

export function DocsList({ project }: { project: PlatformProject }) {
  if (!project.docs.length) return <EmptyBlock title="还没有文档">文档随版本封存，发布后才会对外可见。</EmptyBlock>;
  return (
    <ul className="grid gap-0.5 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-3">
      {project.docs.map((doc) => {
        const body = (
          <>
            <span className="flex items-center justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-surface-raised"><FileText aria-hidden="true" className="size-4" /></span>
              <span className="text-[.6875rem] text-muted-foreground">{docKind[doc.kind]} · {doc.language}</span>
            </span>
            <span className="mt-auto pt-8">
              <span className="flex items-center gap-1.5 text-[1rem] font-medium tracking-[-.01em]">{doc.title}{doc.href ? <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /> : null}</span>
              <span className="mt-1 block text-[.8125rem] leading-5 text-muted-foreground">{doc.summary}</span>
              {!doc.href ? <span className="mt-3 block text-[.6875rem] text-muted-foreground">示例文档 · 没有可打开的正文</span> : null}
            </span>
          </>
        );
        return (
          <li key={doc.title}>
            {doc.href
              ? <a className="group flex min-h-[11rem] flex-col rounded-card bg-surface p-4 transition-colors duration-500 hover:bg-surface-muted" href={doc.href} rel="noopener noreferrer" target="_blank">{body}</a>
              : <div className="flex min-h-[11rem] flex-col rounded-card bg-surface p-4">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

const releaseTone = { PUBLISHED: { label: "已发布", tone: "success" as const }, WITHDRAWN: { label: "已撤回", tone: "neutral" as const }, IN_REVIEW: { label: "审核中", tone: "warning" as const } };

export function ReleasesTimeline({ project }: { project: PlatformProject }) {
  if (!project.releases.length) return <EmptyBlock title="尚未发布">草稿通过独立审核后，会封存为不可变版本并出现在这里。</EmptyBlock>;
  return (
    <ol className="relative border-l border-border/16 pl-6 min-[821px]:ml-[10rem]">
      {project.releases.map((release, index) => (
        <li className="enter relative pb-9 last:pb-0" key={release.version} style={delay(60 + index * 50)}>
          <span aria-hidden="true" className={cn("absolute -left-[1.81rem] top-1 size-3 rounded-full border-2 border-background", release.state === "PUBLISHED" ? (index === 0 ? "bg-lime ring-1 ring-foreground/40" : "bg-foreground") : "bg-muted-foreground/40")} />
          <div className="min-[821px]:absolute min-[821px]:-left-[10.75rem] min-[821px]:top-0 min-[821px]:w-[8.5rem] min-[821px]:text-right">
            <p className="font-code text-[.8125rem] font-medium">{formatVersion(release.version)}</p>
            <p className="mt-0.5 text-[.6875rem] text-muted-foreground">{release.date}</p>
          </div>
          <div className="mt-2 min-[821px]:mt-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn("text-[1rem] font-medium tracking-[-.01em]", release.state === "WITHDRAWN" && "text-muted-foreground line-through decoration-1")}>{release.title}</p>
              <ToneBadge tone={releaseTone[release.state].tone}>{releaseTone[release.state].label}</ToneBadge>
              {release.href ? <a className="group inline-flex items-center gap-1 text-[.75rem] text-muted-foreground hover:text-foreground" href={release.href} rel="noopener noreferrer" target="_blank"><span className="link-grow">查看记录</span><ArrowUpRight aria-hidden="true" className="size-3" /></a> : null}
            </div>
            <ul className="mt-2 space-y-1">
              {release.notes.map((note) => <li className="text-[.8125rem] leading-5 text-muted-foreground" key={note}>— {note}</li>)}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}
