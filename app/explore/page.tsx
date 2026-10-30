import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { ArtSurface } from "@/components/platform/art";
import { ArrowLink, PageIntro, SampleTag, SectionHead, StatusPill, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { ExploreBrowser } from "@/features/platform/components/explore-browser";
import { formatVersion, integrationMeta } from "@/features/platform/labels";
import { listPublicProjects } from "@/features/platform/source";

export const metadata: Metadata = { title: { absolute: "探索项目 · AI-Generator" } };

const steps = [
  ["01", "写一份 Manifest", "名称、类别、可见性与能力。向导会实时生成并按契约校验。", "/platform/projects/new"],
  ["02", "独立审核", "审核人不能是提交人；所有公开资产必须先被批准。", "/platform/developer"],
  ["03", "发布不可变版本", "每个版本都有稳定链接；撤回会保留历史，但不能覆盖。", "/platform/developer"],
] as const;

export default function ExplorePage() {
  const projects = listPublicProjects().data;
  const featured = projects.find((project) => project.provenance === "real") ?? projects[0];
  const rest = projects.filter((project) => project.slug !== featured?.slug);

  return (
    <div className="mx-auto max-w-[100rem] px-4 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10">
      <PageIntro
        description="公开项目目录。每个项目都是一页完整的成果：动机、架构、如实的证据等级、可交互的实验室，以及不可变的版本记录。不公开列出与私有项目不会出现在这里。"
        kicker="探索 · Explore"
        meta={<SampleTag>Registry 部署前：真实项目与示例项目并列，均有标注</SampleTag>}
        title={["被认真展示的项目，", "值得被认真阅读。"]}
      />

      {featured ? (
        <section aria-labelledby="featured-project" className="grid gap-8 min-[1024px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] min-[1024px]:items-end min-[1024px]:gap-12">
          <Link className="enter-media group block" href={`/explore/${featured.slug}`} prefetch={false}>
            <ArtSurface className="aspect-[16/10] w-full rounded-card" k={featured.art} zoom>
              <span className="absolute left-4 top-4 rounded-full bg-[hsl(var(--paper)/.92)] px-3 py-1.5 text-[.75rem] font-medium text-[hsl(var(--ink))]">官方项目 · 真实</span>
              <span className="absolute bottom-4 left-4 rounded-full bg-[hsl(var(--ink)/.55)] px-2.5 py-1 font-code text-[.6875rem] text-[hsl(var(--paper))] backdrop-blur-sm">{integrationMeta[featured.integration].level} · {formatVersion(featured.version)}</span>
            </ArtSurface>
          </Link>
          <div className="enter" style={delay(200)}>
            <p className="kicker">精选<span aria-hidden="true" className="kicker__arrow">↓</span></p>
            <h2 className="mt-4 text-[clamp(2.25rem,4vw,3.75rem)] font-medium leading-[1.02] tracking-[-.045em]" id="featured-project">{featured.name}</h2>
            <p className="mt-3 text-[1.0625rem] leading-7 text-muted-foreground">{featured.tagline}</p>
            <ul className="mt-6 border-t border-border/12">
              {featured.capabilities.slice(0, 4).map((capability) => (
                <li className="flex items-center justify-between gap-3 border-b border-border/12 py-3" key={capability.id}>
                  <span className="text-sm">{capability.label}</span><StatusPill status={capability.status} />
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-2 min-[521px]:flex-row">
              <Button asChild size="lg"><Link href={`/explore/${featured.slug}`} prefetch={false}>查看项目<ArrowUpRight className="size-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/platform" prefetch={false}>浏览演示工作台</Link></Button>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="all-projects" className="mt-24">
        <SectionHead id="all-projects">全部公开项目</SectionHead>
        <ExploreBrowser projects={rest} />
      </section>

      <section aria-labelledby="publish-steps" className="mt-24">
        <SectionHead action={<ArrowLink href="/docs">开发者文档</ArrowLink>} id="publish-steps" meta={<StatusPill status="dev" />}>上架你的项目</SectionHead>
        <div className="grid gap-0.5 min-[821px]:grid-cols-3">
          {steps.map(([n, title, detail, href], index) => (
            <Link className="enter group flex min-h-[13rem] flex-col rounded-card bg-surface p-5 transition-colors duration-500 hover:bg-surface-muted" href={href} key={n} prefetch={false} style={delay(80 + index * 70)}>
              <span className="text-[clamp(2rem,3vw,2.75rem)] font-medium leading-none tracking-[-.05em] text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">{n}</span>
              <span className="mt-auto pt-8 text-[1.0625rem] font-medium tracking-[-.015em]">{title}</span>
              <span className="mt-1.5 text-[.8125rem] leading-5 text-muted-foreground">{detail}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
