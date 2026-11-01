import Link from "next/link";

import { ArtSurface } from "@/components/platform/art";
import { ArrowLink, DemoNotice, Kicker, LoopArrow, SampleTag, SectionHead, ToneBadge, delay } from "@/components/platform/primitives";
import { demos } from "@/features/demos/catalog";
import { categoryLabels, draftStateMeta, formatVersion } from "@/features/platform/labels";
import type { PlatformProject } from "@/features/platform/types";
import { ClaimLedger } from "@/features/research/components/claim-ledger";
import { Breadcrumbs, ClaimStatusBadge, EvidenceList, ExperimentStatusBadge, ResearchFixtureNotice, SiteLabel } from "@/features/research/components/parts";
import { RESEARCH_FIXTURE_LABEL } from "@/features/research/labels";
import { experimentHref, experimentsForClaim, referenceOutcome, verdictOf } from "@/features/research/source";
import type { ResearchClaim, ResearchProject } from "@/features/research/types";
import { getShowcaseRelease } from "@/features/showcase/releases";

function ShowcaseCard({ showcase }: { showcase: PlatformProject }) {
  return (
    <Link className="enter group block" href={`/explore/${showcase.slug}`} prefetch={false} style={delay(220)}>
      <ArtSurface className="aspect-[16/9] w-full rounded-card" k={showcase.art} zoom>
        <span className="absolute left-3 top-3 rounded-full bg-[hsl(var(--paper)/.92)] px-2.5 py-1 text-[.6875rem] font-medium text-[hsl(var(--ink))]">Showcase 项目页</span>
      </ArtSurface>
      <span className="mt-3 flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[1rem] font-medium tracking-[-.01em]"><span className="link-grow">{showcase.name}</span></span>
          <span className="mt-0.5 block text-[.75rem] text-muted-foreground">
            {categoryLabels[showcase.category]} · <span className="font-code">{formatVersion(showcase.version)}</span> · {draftStateMeta[showcase.draftState].label}{showcase.provenance === "sample" ? "（示例）" : ""}
          </span>
        </span>
        <LoopArrow className="mt-1 text-muted-foreground" dir="ur" />
      </span>
    </Link>
  );
}

function ClaimRow({ project, claim }: { project: ResearchProject; claim: ResearchClaim }) {
  const experiments = experimentsForClaim(project, claim.id);
  return (
    <article aria-labelledby={`claim-${claim.id}-title`} className="grid gap-x-10 gap-y-6 py-6 min-[1024px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,.9fr)] min-[1024px]:px-3">
      <div className="min-w-0">
        <ClaimStatusBadge status={claim.status} />
        <h3 className="mt-3 text-[1.0625rem] font-medium tracking-[-.015em]" id={`claim-${claim.id}-title`}>{claim.topic}</h3>
        <p className="mt-1.5 text-[.875rem] leading-6 text-muted-foreground">{claim.statement}</p>
      </div>
      <div className="min-w-0">
        <p className="mb-3 text-[.75rem] font-medium text-muted-foreground">证据 · {claim.evidence.length}</p>
        <EvidenceList empty={claim.status === "PLANNED" ? "没有证据：这是一条计划中的声明。" : "没有可核对的材料。"} items={claim.evidence} />
      </div>
      <div className="min-w-0">
        <p className="mb-3 text-[.75rem] font-medium text-muted-foreground">实验 · {experiments.length}</p>
        {experiments.length ? (
          <ul className="space-y-3">
            {experiments.map((experiment) => (
              <li key={experiment.id}>
                <Link className="group flex items-start gap-3" href={experimentHref(project.slug, experiment.id)} prefetch={false}>
                  <span className="mt-px font-code text-[.75rem] font-medium">{experiment.id}</span>
                  <span className="min-w-0">
                    <span className="link-grow text-[.8125rem] font-medium leading-5">{experiment.title}</span>
                    <span className="mt-1.5 block"><ExperimentStatusBadge status={experiment.status} /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-[.8125rem] leading-6 text-muted-foreground">没有实验检验这条声明。</p>}
      </div>
    </article>
  );
}

/** One research project: the question, the claim ledger and the experiment records. */
export function ResearchProjectView({ project, showcase }: { project: ResearchProject; showcase?: PlatformProject }) {
  const reproducible = project.experiments.filter((experiment) => experiment.status === "REPRODUCIBLE").length;
  const covered = project.claims.filter((claim) => experimentsForClaim(project, claim.id).length > 0).length;
  const demo = demos.find((item) => item.slug === project.showcaseSlug);
  const release = project.showcaseSlug ? getShowcaseRelease(project.showcaseSlug) : undefined;
  const facts = [
    ["声明", String(project.claims.length)],
    ["有实验检验的声明", `${covered} / ${project.claims.length}`],
    ["实验记录", String(project.experiments.length)],
    ["可在本机复现", String(reproducible)],
  ] as const;

  return (
    <article className="mx-auto max-w-[100rem] px-4 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10">
      <Breadcrumbs trail={[{ label: "Research Lab", href: "/research" }, { label: project.title }]} />

      <header className="grid gap-10 pb-10 pt-8 min-[1024px]:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] min-[1024px]:items-end min-[1024px]:gap-16 min-[1024px]:pb-14">
        <div className="min-w-0">
          <div className="enter flex flex-wrap items-center gap-2">
            <Kicker>研究项目</Kicker>
            <ToneBadge tone={project.provenance === "real" ? "ink" : "neutral"}>{project.provenance === "real" ? "真实项目" : "示例项目"}</ToneBadge>
            <SampleTag>{RESEARCH_FIXTURE_LABEL}</SampleTag>
          </div>
          <h1 className="mt-4 text-balance text-[clamp(2.35rem,5vw,4.6rem)] font-medium leading-[1.04] tracking-[-.04em]"><span className="title-line"><span>{project.title}</span></span></h1>
          <p className="enter mt-6 max-w-[46rem] text-[clamp(1.1rem,1.55vw,1.4rem)] leading-[1.5] tracking-[-.01em]" style={delay(200)}>{project.question}</p>
          <p className="enter mt-3 max-w-[40rem] text-[.9375rem] leading-7 text-muted-foreground" style={delay(260)}>{project.summary}</p>
        </div>
        {showcase ? <ShowcaseCard showcase={showcase} /> : null}
      </header>

      <div className="space-y-2">
        <ResearchFixtureNotice />
        {project.provenance === "sample" ? (
          <DemoNotice label="示例项目">
            这个研究项目对应 Showcase 中的示例项目：作者、版本与声明都是为演示平台而编写的。{reproducible ? "其中标为「可本地复现」的实验运行的是仓库里的真实代码，数字由计算得到。" : "它没有任何实验结果，只展示协议与解锁条件。"}
          </DemoNotice>
        ) : null}
      </div>

      <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-border/12 py-6 min-[821px]:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-caption">{label}</dt>
            <dd className="mt-1 text-[clamp(1.5rem,2.2vw,2rem)] font-medium leading-none tracking-[-.04em] tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="research-approach" className="mt-20">
        <SectionHead id="research-approach">研究方法</SectionHead>
        <div className="grid gap-8 min-[821px]:grid-cols-3">
          {project.approach.map((section, index) => (
            <section className="enter border-t border-border/14 pt-4" key={section.title} style={delay(80 + index * 60)}>
              <h3 className="text-[.8125rem] font-medium">{section.title}</h3>
              <p className="mt-2 text-[.9375rem] leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>
      </section>

      <section aria-labelledby="research-claims" className="mt-24 scroll-mt-28" id="claims">
        <SectionHead id="research-claims" meta={<span className="text-caption">声明 → 证据 → 实验</span>}>声明与证据</SectionHead>
        <p className="mb-6 max-w-[48rem] text-[.8125rem] leading-6 text-muted-foreground">
          声明的证据等级与 Showcase 项目页一致，由项目发布的内容决定。本页的复现结果不会改变声明等级；等级只能随新版本的发布与审核而改变。
        </p>
        <ClaimLedger items={project.claims.map((claim) => ({ id: claim.id, status: claim.status, content: <ClaimRow claim={claim} project={project} /> }))} />
      </section>

      <section aria-labelledby="research-experiments" className="mt-24 scroll-mt-28" id="experiments">
        <SectionHead id="research-experiments" meta={<span className="text-caption">{project.experiments.length} 个实验</span>}>实验记录</SectionHead>
        <ul className="border-t border-border/12">
          {project.experiments.map((experiment) => {
            const reference = referenceOutcome(experiment);
            const verdict = reference ? verdictOf(reference) : undefined;
            return (
              <li key={experiment.id}>
                <Link className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b border-border/12 py-5 transition-colors duration-300 hover:bg-surface/50 min-[1024px]:grid-cols-[6rem_minmax(0,1fr)_9.5rem_10rem_1rem] min-[1024px]:gap-x-6" href={experimentHref(project.slug, experiment.id)} prefetch={false}>
                  <span className="font-code text-[.8125rem] font-medium">{experiment.id}</span>
                  <span className="col-span-2 row-start-2 min-w-0 min-[1024px]:col-span-1 min-[1024px]:row-start-auto">
                    <span className="block text-[1rem] font-medium tracking-[-.01em]">{experiment.title}</span>
                    <span className="mt-1 block max-w-[44rem] text-[.8125rem] leading-6 text-muted-foreground">{experiment.objective}</span>
                  </span>
                  <SiteLabel className="col-span-2 min-[1024px]:col-span-1 min-[1024px]:pt-1" site={experiment.site} />
                  <span className="col-start-2 row-start-1 flex flex-col items-end gap-1 min-[1024px]:col-start-auto min-[1024px]:row-start-auto min-[1024px]:items-start min-[1024px]:pt-0.5">
                    <ExperimentStatusBadge status={experiment.status} />
                    {verdict ? <span className="text-[.6875rem] text-muted-foreground">参考判定 {verdict.passed}/{verdict.total} 项通过</span> : null}
                  </span>
                  <LoopArrow className="hidden text-muted-foreground min-[1024px]:mt-1.5 min-[1024px]:inline-grid" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {showcase ? (
        <section aria-labelledby="research-related" className="mt-24">
          <SectionHead id="research-related">关联</SectionHead>
          <ul className="grid gap-0.5 min-[821px]:grid-cols-3">
            <li className="flex min-h-[8.5rem] flex-col rounded-card bg-surface p-5">
              <span className="text-caption">Showcase</span>
              <span className="mt-1 text-[.9375rem] font-medium">项目页：成果、架构与版本</span>
              <ArrowLink className="mt-auto pt-4" href={`/explore/${showcase.slug}`}>打开项目页</ArrowLink>
            </li>
            {release ? (
              <li className="flex min-h-[8.5rem] flex-col rounded-card bg-surface p-5">
                <span className="text-caption">Showcase · Fixture</span>
                <span className="mt-1 text-[.9375rem] font-medium">版本页预览：按 ReleaseDTO 渲染的研究声明</span>
                <ArrowLink className="mt-auto pt-4" href={`/explore/${showcase.slug}/release`}>打开版本页预览</ArrowLink>
              </li>
            ) : null}
            {demo ? (
              <li className="flex min-h-[8.5rem] flex-col rounded-card bg-surface p-5">
                <span className="text-caption">Demo · 真实执行</span>
                <span className="mt-1 text-[.9375rem] font-medium">{demo.execution === "server" ? "已上线的公开 Demo，在平台服务端求解" : "已上线的公开 Demo，在你的浏览器中训练"}</span>
                <span className="mt-1 text-[.75rem] leading-5 text-muted-foreground">独立于研究记录：它不复现、也不改写本页的任何实验。</span>
                <ArrowLink className="mt-auto pt-4" href={demo.href}>打开 Demo</ArrowLink>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
