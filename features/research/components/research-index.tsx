import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { BigNumber, LoopArrow, PageIntro, SampleTag, SectionHead, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { ExperimentRegistry } from "@/features/research/components/experiment-registry";
import { ClaimLegend, ClaimSpectrum, ExperimentStatusBadge, ResearchFixtureNotice } from "@/features/research/components/parts";
import { experimentStatusMeta, experimentStatusOrder, RESEARCH_FIXTURE_LABEL } from "@/features/research/labels";
import { listExperimentSummaries, listResearchProjects, researchHref } from "@/features/research/source";

const boundaries = [
  ["公开访问者只浏览", "研究页面没有任何服务端运行入口：没有按钮会触发服务器、GPU 或付费计算，也不会调用第三方服务。"],
  ["本机复现不离开设备", "「可本地复现」的实验在你的浏览器中运行仓库里的同一份代码，不发送请求，结果也不会被保存或上传。"],
  ["服务端复现尚未开放", "需要运行记录、复现判定、受控运行环境，以及发起人身份、配额、隔离与审计（L-3、L-4、L-8、L-9）。"],
] as const;

/** Research Lab home: how to read a claim, the research projects and every experiment record. */
export function ResearchIndex() {
  const projects = listResearchProjects().data;
  const experiments = listExperimentSummaries();
  const counts = Object.fromEntries(experimentStatusOrder.map((status) => [status, experiments.filter((item) => item.status === status).length]));

  return (
    <div className="mx-auto max-w-[100rem] px-4 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10">
      <PageIntro
        actions={(
          <>
            <Button asChild size="lg"><a href="#experiments">查看实验记录</a></Button>
            <Button asChild size="lg" variant="outline"><Link href="/explore" prefetch={false}>Showcase 项目<ArrowUpRight className="size-4" /></Link></Button>
          </>
        )}
        description="研究项目的声明、证据与实验记录。确定性的实验可以在你的浏览器里用同一份代码重算，并与参考结果逐项比对；需要服务端、GPU 或尚未分发的证据才能进行的实验，只给出协议与解锁条件，不显示任何数字。"
        kicker="研究 · Research Lab"
        meta={<SampleTag>{RESEARCH_FIXTURE_LABEL}</SampleTag>}
        title={["每一条结论，", "都能追到证据。"]}
      />

      <ResearchFixtureNotice />

      <section aria-labelledby="status-legend" className="mt-16">
        <SectionHead id="status-legend" meta={<span className="text-caption">每个实验都处于其中一种状态</span>}>怎么读这里的结论</SectionHead>
        <dl className="grid gap-x-8 gap-y-8 border-t border-border/12 pt-6 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {experimentStatusOrder.map((status, index) => (
            <div className="enter" key={status} style={delay(80 + index * 60)}>
              <dt className="flex items-end justify-between gap-3">
                <BigNumber value={counts[status]} />
                <ExperimentStatusBadge status={status} />
              </dt>
              <dd className="mt-3 text-[.8125rem] leading-6 text-muted-foreground">{experimentStatusMeta[status].detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="research-projects" className="mt-24">
        <SectionHead id="research-projects" meta={<span className="text-caption">{projects.length} 个研究项目，均关联 Showcase 项目</span>}>研究项目</SectionHead>
        <ol className="border-t border-border/12">
          {projects.map((project, index) => {
            const reproducible = project.experiments.filter((experiment) => experiment.status === "REPRODUCIBLE").length;
            const statuses = project.claims.map((claim) => claim.status);
            return (
              <li key={project.slug}>
                <Link className="group grid gap-x-8 gap-y-4 border-b border-border/12 py-7 transition-colors duration-300 hover:bg-surface/50 min-[900px]:grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(14rem,1fr)_1rem] min-[900px]:items-start" href={researchHref(project.slug)} prefetch={false}>
                  <span className="font-code text-[.75rem] text-muted-foreground min-[900px]:pt-2">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[clamp(1.35rem,2vw,1.75rem)] font-medium leading-tight tracking-[-.03em]">{project.title}</span>
                      <ToneBadge tone={project.provenance === "real" ? "ink" : "neutral"}>{project.provenance === "real" ? "真实项目" : "示例项目"}</ToneBadge>
                    </span>
                    <span className="mt-2 block max-w-[46rem] text-[.9375rem] leading-7 text-muted-foreground">{project.question}</span>
                  </span>
                  <span className="min-w-0 min-[900px]:pt-2">
                    <ClaimSpectrum statuses={statuses} />
                    <ClaimLegend className="mt-2" statuses={statuses} />
                    <span className="mt-3 block text-[.75rem] text-muted-foreground">
                      {project.claims.length} 条声明 · {project.experiments.length} 个实验{reproducible ? ` · ${reproducible} 个可本地复现` : ""}
                    </span>
                  </span>
                  <LoopArrow className="hidden text-muted-foreground min-[900px]:mt-2.5 min-[900px]:inline-grid" />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="experiment-registry" className="mt-24 scroll-mt-28" id="experiments">
        <SectionHead id="experiment-registry" meta={<span className="text-caption">点开任一实验，查看方法、环境、版本与结果</span>}>实验记录</SectionHead>
        <ExperimentRegistry experiments={experiments} projects={projects.map((project) => ({ slug: project.slug, title: project.title }))} />
      </section>

      <section aria-labelledby="execution-boundary" className="mt-24">
        <SectionHead id="execution-boundary">执行边界</SectionHead>
        <div className="grid gap-0.5 min-[821px]:grid-cols-3">
          {boundaries.map(([title, body]) => (
            <div className="rounded-card bg-surface p-5" key={title}>
              <p className="text-[1rem] font-medium tracking-[-.01em]">{title}</p>
              <p className="mt-2 text-[.8125rem] leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
