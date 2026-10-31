import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FileText, FlaskConical, ImageOff } from "lucide-react";

import { ArtSurface } from "@/components/platform/art";
import { DemoNotice, SectionHead, ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { demos } from "@/features/demos/catalog";
import { LaunchLab } from "@/features/platform/labs/launch-lab";
import { claimMeta } from "@/features/platform/labels";
import { ReleaseMarkdown } from "@/features/showcase/components/release-markdown";
import type { ShowcaseRelease } from "@/features/showcase/releases";
import type { ReleaseDTO } from "@/features/registry/contracts";

type Section = ReleaseDTO["presentation"]["sections"][number];
type Metric = Extract<Section, { kind: "BENCHMARKS" }>["metrics"][number];

const visibilityLabel = { PUBLIC: "公开", UNLISTED: "不公开列出" } as const;
const languageLabel = { zh: "中文", en: "English" } as const;

function ImageSection({ section }: { section: Extract<Section, { kind: "IMAGE" }> }) {
  return (
    <figure>
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-card bg-surface px-6 text-center" role="img" aria-label={`${section.alt}（图片资产尚未开放分发）`}>
        <ImageOff aria-hidden="true" className="size-5 text-muted-foreground" />
        <p className="text-[.8125rem] font-medium">图片资产尚未开放分发</p>
        <p className="max-w-[32rem] text-[.75rem] leading-5 text-muted-foreground">替代文本：{section.alt}</p>
      </div>
      <figcaption className="mt-2 text-[.75rem] text-muted-foreground">{section.title} · 资产 <span className="font-code">{section.assetId.slice(0, 8)}</span></figcaption>
    </figure>
  );
}

function MetricRow({ metric }: { metric: Metric }) {
  if (metric.status === "UNPUBLISHED") {
    return (
      <tr className="border-b border-border/12">
        <th className="py-3 pr-4 font-medium" scope="row">{metric.name}</th>
        <td className="py-3 pr-4"><ToneBadge tone="neutral">未发布</ToneBadge></td>
        <td className="py-3 pr-4 text-muted-foreground" colSpan={3}>作者没有发布这个数值，因此这里不显示任何数字。</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-border/12">
      <th className="py-3 pr-4 font-medium" scope="row">{metric.name}</th>
      <td className="py-3 pr-4"><ToneBadge tone="info">已报告</ToneBadge></td>
      <td className="py-3 pr-4 font-code tabular-nums">{metric.value} {metric.unit}</td>
      <td className="py-3 pr-4">{metric.dataset} · {metric.protocol}</td>
      <td className="py-3 pr-4 font-code text-[.75rem]">{metric.modelVersion}</td>
    </tr>
  );
}

function SectionBlock({ section }: { section: Section }) {
  const id = `release-${section.id}`;
  return (
    <section aria-labelledby={`${id}-title`} className="scroll-mt-28" id={id}>
      <h2 className="mb-5 text-[clamp(1.5rem,2.2vw,1.9rem)] font-medium tracking-[-.03em]" id={`${id}-title`}>{section.title}</h2>
      {section.kind === "MARKDOWN" ? <ReleaseMarkdown>{section.body}</ReleaseMarkdown> : null}
      {section.kind === "IMAGE" ? <ImageSection section={section} /> : null}
      {section.kind === "BENCHMARKS" ? (
        <div className="scroll-x">
          <table className="w-full min-w-[36rem] border-collapse text-left text-[.8125rem]">
            <caption className="sr-only">{section.title}</caption>
            <thead>
              <tr className="border-b border-border/20 text-[.75rem] text-muted-foreground">
                <th className="py-2 pr-4 font-medium" scope="col">指标</th>
                <th className="py-2 pr-4 font-medium" scope="col">状态</th>
                <th className="py-2 pr-4 font-medium" scope="col">数值</th>
                <th className="py-2 pr-4 font-medium" scope="col">数据集 · 协议</th>
                <th className="py-2 pr-4 font-medium" scope="col">模型版本</th>
              </tr>
            </thead>
            <tbody>{section.metrics.map((metric) => <MetricRow key={metric.name} metric={metric} />)}</tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/**
 * A Registry release page rendered from the `ReleaseDTO` shape. Today the data is a fixture
 * (see features/showcase/releases.ts) and the page says so before anything else.
 */
export function ReleaseShowcase({ entry }: { entry: ShowcaseRelease }) {
  const { release } = entry;
  const demo = demos.find((item) => item.slug === entry.slug)!;

  return (
    <article>
      <section className="relative isolate flex min-h-[clamp(24rem,58vh,36rem)] flex-col justify-end overflow-hidden text-[hsl(var(--paper))]">
        <ArtSurface className="absolute inset-0 -z-10" k={entry.art} />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,hsl(var(--ink)/.88),hsl(var(--ink)/.4)_50%,transparent_80%)]" />
        <div className="mx-auto w-full max-w-[100rem] px-4 pb-10 pt-28 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pb-12">
          <div className="enter flex flex-wrap items-center gap-1.5 text-[.6875rem]">
            <span className="rounded-full bg-[hsl(var(--paper)/.92)] px-2.5 py-1 font-medium text-[hsl(var(--ink))]">Registry 版本页 · 预览</span>
            <span className="rounded-full border border-[hsl(var(--paper)/.45)] px-2.5 py-1 font-medium">Fixture · 未发布</span>
            <span className="rounded-full border border-[hsl(var(--paper)/.35)] px-2.5 py-1 font-code">v{release.version}</span>
            <span className="rounded-full border border-[hsl(var(--paper)/.35)] px-2.5 py-1">目标可见性 · {visibilityLabel[release.visibility]}</span>
          </div>
          <h1 className="mt-5 max-w-[60rem] text-balance text-[clamp(2.5rem,6vw,5.5rem)] font-medium leading-[.98] tracking-[-.05em]"><span className="title-line"><span>{release.name}</span></span></h1>
          <p className="mt-4 max-w-[40rem] text-[clamp(1rem,1.3vw,1.2rem)] leading-relaxed text-[hsl(var(--paper)/.82)]">{release.summary}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link className="btn-wipe inline-flex h-11 items-center gap-2 rounded-full border border-[hsl(var(--paper))] bg-[hsl(var(--paper))] px-5 text-[.8125rem] font-medium text-[hsl(var(--ink))]" href={demo.href} prefetch={false}><FlaskConical aria-hidden="true" className="size-4" />运行真实 Demo</Link>
            <Link className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[hsl(var(--paper)/.4)] px-5 text-[.8125rem] font-medium transition-colors duration-300 hover:border-[hsl(var(--paper))] hover:bg-[hsl(var(--paper)/.1)]" href={`/explore/${entry.slug}`} prefetch={false}><ArrowLeft aria-hidden="true" className="size-3.5" />项目页</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[100rem] px-4 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)]">
        <DemoNotice className="mt-8" label="Fixture · 未发布">
          这一页按 Registry 的公开发布结构（releaseDTOSchema）渲染一份示例数据，用来预览项目发布后的样子。Registry 的公开读取目前对所有请求返回 NOT_FOUND，所以这不是已发布的 Release，页面也没有读取任何 Registry 数据。下方的 Demo 是真实可运行的。
        </DemoNotice>

        <div className="mt-12 grid gap-12 min-[1180px]:grid-cols-[minmax(0,1fr)_20rem] min-[1180px]:gap-16">
          <div className="min-w-0 space-y-16">
            {release.presentation.sections.map((section) => <SectionBlock key={section.id} section={section} />)}

            <section aria-labelledby="release-claims-title">
              <h2 className="mb-5 text-[clamp(1.5rem,2.2vw,1.9rem)] font-medium tracking-[-.03em]" id="release-claims-title">研究声明</h2>
              <ul className="border-t border-border/12">
                {release.researchClaims.map((claim) => (
                  <li className="grid gap-1.5 border-b border-border/12 py-4 min-[640px]:grid-cols-[12rem_minmax(0,1fr)] min-[640px]:gap-6" key={claim.topic}>
                    <div className="flex flex-wrap items-center gap-2">
                      <ToneBadge tone={claimMeta[claim.status].tone}>{claimMeta[claim.status].label}</ToneBadge>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{claim.topic}</p>
                      <p className="mt-1 text-[.8125rem] leading-6 text-muted-foreground">{claim.description}</p>
                      {claim.evidenceAssetIds.length ? <p className="mt-1 text-[.75rem] text-muted-foreground">证据资产 {claim.evidenceAssetIds.length} 个，尚未开放分发</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="release-lab-title">
              <SectionHead id="release-lab-title" meta={<ToneBadge tone="success">真实执行</ToneBadge>}>实验室</SectionHead>
              <LaunchLab slug={entry.slug} />
            </section>
          </div>

          <aside aria-label="发布信息" className="space-y-0.5 min-[1180px]:sticky min-[1180px]:top-[calc(var(--shell-header-height,4rem)+1rem)] min-[1180px]:self-start">
            <section aria-labelledby="release-facts" className="rounded-card bg-surface p-5">
              <h2 className="text-sm font-medium" id="release-facts">发布信息</h2>
              <dl className="mt-3 text-[.8125rem]">
                {[
                  ["状态", "Fixture，未发布"],
                  ["版本", `v${release.version}`],
                  ["目标可见性", visibilityLabel[release.visibility]],
                  ["结构版本", release.schemaVersion],
                  ["Release ID", `${release.releaseId.slice(0, 8)}…（示例）`],
                ].map(([label, value]) => (
                  <div className="flex justify-between gap-4 border-b border-border/12 py-2 last:border-0" key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[.75rem] leading-5 text-muted-foreground">{entry.basis}</p>
            </section>

            <section aria-labelledby="release-docs" className="rounded-card bg-surface p-5">
              <h2 className="text-sm font-medium" id="release-docs">文档</h2>
              <ul className="mt-3 space-y-2 text-[.8125rem]">
                {release.documentation.map((doc) => (
                  <li className="flex gap-2" key={doc.id}>
                    <FileText aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span><span className="font-medium">{doc.title}</span><span className="block text-[.75rem] text-muted-foreground">{languageLabel[doc.language]} · 文档资产尚未开放分发</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[.75rem] text-muted-foreground">站内可读版本</p>
              <ul className="mt-1.5 space-y-1.5 text-[.8125rem]">
                {entry.siteDocs.map((doc) => (
                  <li key={doc.href}><Link className="group inline-flex items-center gap-1 font-medium" href={doc.href} prefetch={false}><span className="link-grow">{doc.title}</span><ArrowUpRight aria-hidden="true" className="size-3" /></Link></li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="release-rules" className="rounded-card bg-surface p-5">
              <h2 className="text-sm font-medium" id="release-rules">公开之后会怎样</h2>
              <p className="mt-2 text-[.75rem] leading-5 text-muted-foreground">只有当前有效、未撤回的 Release 才会显示在这里；撤回、替换或转为私有后旧链接立即失效，不会回退到旧版本或草稿。</p>
              <Button asChild className="mt-3" size="sm" variant="outline"><Link href="/platform/developer/access#ac-visibility" prefetch={false}>可见性与公开投影规则</Link></Button>
            </section>
          </aside>
        </div>
      </div>
    </article>
  );
}
