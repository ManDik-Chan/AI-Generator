import Link from "next/link";
import { ArrowUpRight, FlaskConical } from "lucide-react";

import { ArtSurface } from "@/components/platform/art";
import { DemoNotice, EmptyBlock, SectionHead, delay } from "@/components/platform/primitives";
import { Tabs } from "@/components/platform/tabs";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/features/platform/components/project-card";
import { ArchitectureDiagram, BenchmarksPanel, CapabilityList, ClaimsList, DocsList, OverviewSections, ReleasesTimeline } from "@/features/platform/components/sections";
import { ApiLab } from "@/features/platform/labs/api-lab";
import { HubLab } from "@/features/platform/labs/hub-lab";
import { SortingLab } from "@/features/platform/labs/sorting-lab";
import { VolumeLab } from "@/features/platform/labs/volume-lab";
import { categoryLabels, formatVersion, integrationMeta, visibilityMeta } from "@/features/platform/labels";
import type { PlatformProject } from "@/features/platform/types";

function Lab({ project }: { project: PlatformProject }) {
  if (project.lab === "volume") return <VolumeLab />;
  if (project.lab === "sorting") return <SortingLab />;
  if (project.lab === "api") return <ApiLab />;
  if (project.lab === "hub") return <HubLab project={project} />;
  return <EmptyBlock title="这个项目只展示，不运行">L0 展示型项目没有可交互的实验室；阅读概览、文档与版本记录即可了解它。</EmptyBlock>;
}

/** Public project page: full-bleed artwork, honest provenance, tabs from overview to releases. */
export function ProjectShowcase({ project, related }: { project: PlatformProject; related: PlatformProject[] }) {
  const integration = integrationMeta[project.integration];
  const tabs = [
    {
      id: "overview",
      label: "概览",
      content: (
        <div className="space-y-16">
          <OverviewSections project={project} />
          <CapabilityList project={project} />
          <ClaimsList project={project} />
        </div>
      ),
    },
    { id: "lab", label: "实验室", content: <Lab project={project} /> },
    { id: "architecture", label: "架构", content: <ArchitectureDiagram project={project} /> },
    { id: "benchmarks", label: "基准", content: <BenchmarksPanel project={project} /> },
    { id: "docs", label: "文档", count: project.docs.length, content: <DocsList project={project} /> },
    { id: "releases", label: "版本", count: project.releases.length, content: <ReleasesTimeline project={project} /> },
  ];

  return (
    <article>
      <section className="relative isolate flex min-h-[clamp(28rem,74vh,46rem)] flex-col justify-end overflow-hidden text-[hsl(var(--paper))]">
        <ArtSurface className="absolute inset-0 -z-10" k={project.art} />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,hsl(var(--ink)/.86),hsl(var(--ink)/.35)_45%,transparent_75%)]" />
        <div className="mx-auto w-full max-w-[100rem] px-4 pb-10 pt-32 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pb-14">
          <div className="enter flex flex-wrap items-center gap-1.5 text-[.6875rem]">
            <span className="rounded-full bg-[hsl(var(--paper)/.92)] px-2.5 py-1 font-medium text-[hsl(var(--ink))]">{categoryLabels[project.category]}</span>
            <span className="rounded-full border border-[hsl(var(--paper)/.35)] px-2.5 py-1">{project.provenance === "real" ? "真实项目" : "示例项目"}</span>
            <span className="rounded-full border border-[hsl(var(--paper)/.35)] px-2.5 py-1 font-code">{integration.level} · {integration.label}</span>
            {project.visibility !== "PUBLIC" ? <span className="rounded-full bg-[hsl(var(--paper)/.18)] px-2.5 py-1">{visibilityMeta[project.visibility].label}</span> : null}
          </div>
          <div className="mt-5 flex flex-col gap-8 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between">
            <div className="min-w-0 max-w-[60rem]">
              <h1 className="text-balance text-[clamp(2.75rem,7vw,6.5rem)] font-medium leading-[.98] tracking-[-.05em]"><span className="title-line"><span>{project.name}</span></span></h1>
              <p className="enter mt-5 max-w-[40rem] text-[clamp(1rem,1.3vw,1.25rem)] leading-relaxed text-[hsl(var(--paper)/.82)]" style={delay(260)}>{project.tagline}</p>
            </div>
            <div className="enter flex shrink-0 flex-col gap-4 min-[1024px]:items-end" style={delay(340)}>
              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[.75rem] min-[1024px]:justify-end">
                <div><dt className="text-[hsl(var(--paper)/.55)]">作者</dt><dd className="mt-0.5 font-medium">{project.owner}</dd></div>
                <div><dt className="text-[hsl(var(--paper)/.55)]">版本</dt><dd className="mt-0.5 font-code font-medium">{formatVersion(project.version)}</dd></div>
                <div><dt className="text-[hsl(var(--paper)/.55)]">更新</dt><dd className="mt-0.5 font-medium">{project.updated}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {project.lab ? <a className="btn-wipe inline-flex h-11 items-center gap-2 rounded-full border border-[hsl(var(--paper))] bg-[hsl(var(--paper))] px-5 text-[.8125rem] font-medium text-[hsl(var(--ink))]" href="#lab"><FlaskConical aria-hidden="true" className="size-4" />打开实验室</a> : null}
                {project.links?.map((link) => (
                  <a className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[hsl(var(--paper)/.4)] px-5 text-[.8125rem] font-medium transition-colors duration-300 hover:border-[hsl(var(--paper))] hover:bg-[hsl(var(--paper)/.1)]" href={link.href} key={link.href} rel="noopener noreferrer" target="_blank">{link.label}<ArrowUpRight aria-hidden="true" className="size-3.5" /></a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[100rem] px-4 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)]">
        {project.provenance === "sample" || project.visibility === "UNLISTED" ? (
          <div className="mt-8 space-y-2">
            {project.provenance === "sample" ? <DemoNotice label="示例项目">这是为展示平台能力而编写的示例：人物、版本与运行记录均为示例；实验室里的计算在你的浏览器中真实进行，不发送任何数据。</DemoNotice> : null}
            {project.visibility === "UNLISTED" ? <DemoNotice label="不公开列出">这个项目不会出现在探索目录里，只有持有链接的人能看到它的公开内容。</DemoNotice> : null}
          </div>
        ) : null}

        <Tabs className="mt-10" items={tabs} label={`${project.name} 的内容`} />

        {related.length ? (
          <section aria-labelledby="related-projects" className="mt-24">
            <SectionHead action={<Link className="group inline-flex items-center gap-1.5 text-[.8125rem] font-medium" href="/explore" prefetch={false}><span className="link-grow">全部项目</span></Link>} id="related-projects">继续探索</SectionHead>
            <div className="grid gap-x-4 gap-y-12 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-3">
              {related.map((item, index) => <ProjectCard href={`/explore/${item.slug}`} index={index} key={item.slug} project={item} showStates={false} />)}
            </div>
          </section>
        ) : null}

        <section className="mt-24 flex flex-col gap-6 rounded-card bg-surface p-6 min-[821px]:flex-row min-[821px]:items-end min-[821px]:justify-between min-[821px]:p-10">
          <div className="max-w-[36rem]">
            <p className="kicker">发布你的项目<span aria-hidden="true" className="kicker__arrow">↓</span></p>
            <p className="mt-4 text-[clamp(1.6rem,2.6vw,2.4rem)] font-medium leading-[1.12] tracking-[-.035em]">一页完整的成果，一组不可变的版本，一份如实的证据清单。</p>
          </div>
          <div className="flex flex-col gap-2 min-[521px]:flex-row">
            <Button asChild size="lg"><Link href="/platform/projects/new" prefetch={false}>试试新建项目</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/platform/developer" prefetch={false}>开发者控制台</Link></Button>
          </div>
        </section>
      </div>
    </article>
  );
}
