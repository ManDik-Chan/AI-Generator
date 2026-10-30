import Link from "next/link";
import type { ReactNode } from "react";
import { FolderPlus, KeyRound, Lock, MessageSquareText, ShieldCheck, Workflow, Wrench } from "lucide-react";

import type { ShellMode } from "@/components/layout/navigation";
import { ArtSurface } from "@/components/platform/art";
import { ArrowLink, EmptyBlock, LoopArrow, SampleTag, SectionHead, StatusPill, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import type { ArtKey } from "@/features/landing/art";
import type { HomeActivity, HomeMetrics } from "@/features/home/presentation";
import { NewProjectTile, ProjectCard } from "@/features/platform/components/project-card";
import type { CapabilityStatus } from "@/features/platform/status";
import type { PlatformProject } from "@/features/platform/types";
import { cn } from "@/lib/utils";

/*
 * Presentational blocks of the workspace home. The live page feeds them account data;
 * the demo workspace feeds them sample data. They never fetch anything themselves.
 */

const route = (mode: ShellMode, live: string, demo: string) => (mode === "demo" ? demo : live);

export function HomeHero({ kicker, summary, mode, actions }: { kicker: ReactNode; summary: ReactNode; mode: ShellMode; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-8 pb-10 pt-2 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between min-[1024px]:pb-14 min-[1024px]:pt-4">
      <div className="min-w-0 max-w-[54rem]">
        <div className="enter flex flex-wrap items-center gap-2">
          <p className="kicker">{kicker}<span aria-hidden="true" className="kicker__arrow">↓</span></p>
          {mode === "demo" ? <SampleTag>示例账户</SampleTag> : null}
        </div>
        <h1 className="mt-4 text-balance text-[clamp(2.5rem,5.4vw,5.1rem)] font-medium leading-[1.02] tracking-[-.045em]">
          <span className="title-line"><span>把想法做成项目，</span></span>
          <span className="title-line" style={delay(90)}><span>把项目带到台前。</span></span>
        </h1>
        <p className="enter mt-5 max-w-[38rem] text-[.9375rem] leading-7 text-muted-foreground" style={delay(260)}>{summary}</p>
      </div>
      {actions ? <div className="enter flex flex-col gap-2 min-[521px]:flex-row min-[1024px]:shrink-0" style={delay(340)}>{actions}</div> : null}
    </section>
  );
}

const activityIcon = { chat: MessageSquareText, tool: Wrench, agent: Workflow } as const;

export function ContinueBlock({ activity, mode, sample = false }: { activity: HomeActivity[]; mode: ShellMode; sample?: boolean }) {
  return (
    <section aria-labelledby="home-continue">
      <SectionHead action={<ArrowLink href={route(mode, "/tools/history", "/platform/tools")}>运行历史</ArrowLink>} id="home-continue" meta={sample ? <SampleTag /> : null}>继续工作</SectionHead>
      {activity.length ? (
        <ol className="border-t border-border/12">
          {activity.map((item, index) => {
            const Icon = activityIcon[item.kind];
            return (
              <li className="enter" key={item.id} style={delay(120 + index * 50)}>
                <Link className="group grid min-h-[4.25rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 border-b border-border/12 py-3" href={item.href} prefetch={false}>
                  <span className="grid size-9 place-items-center rounded-full bg-surface text-muted-foreground transition-colors duration-500 group-hover:bg-lime group-hover:text-[hsl(var(--ink))]"><Icon aria-hidden="true" className="size-4" /></span>
                  <span className="min-w-0">
                    <span className="link-grow block w-fit max-w-full truncate text-sm font-medium">{item.title}</span>
                    <span className="mt-1 block truncate text-[.75rem] text-muted-foreground">{item.meta}</span>
                  </span>
                  <span className="flex items-center gap-3 text-[.75rem] tabular-nums text-muted-foreground">
                    <span className="max-[520px]:hidden">{item.time}</span>
                    <LoopArrow className="text-sm group-hover:text-foreground" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyBlock action={<Button asChild size="sm"><Link href={route(mode, "/chat", "/platform/chat")} prefetch={false}>开始第一段对话</Link></Button>} title="还没有最近的工作">对话、工具和 Agent 运行会按时间出现在这里，不使用任何虚构记录。</EmptyBlock>
      )}
    </section>
  );
}

interface HubRow {
  word: string;
  href: string;
  art: ArtKey;
  value?: number;
  note?: ReactNode;
}

/** The landing page's big index list, carrying real counts. */
export function HubIndex({ metrics, mode, sample = false }: { metrics?: HomeMetrics; mode: ShellMode; sample?: boolean }) {
  const rows: HubRow[] = [
    { word: "对话", href: route(mode, "/chat", "/platform/chat"), art: "chat", value: metrics?.conversations },
    { word: "人格", href: route(mode, "/personas", "/platform/personas"), art: "persona", value: metrics?.personas },
    {
      word: "记忆",
      href: route(mode, "/memories", "/platform/memory"),
      art: "memory",
      value: metrics?.memories,
      note: metrics?.pendingProposals ? <span className="rounded-full bg-lime px-2 py-0.5 text-[.625rem] font-medium text-[hsl(var(--ink))]">{metrics.pendingProposals} 待确认</span> : null,
    },
    { word: "工具", href: route(mode, "/tools", "/platform/tools"), art: "stone", value: metrics?.toolRuns },
    { word: "图片", href: route(mode, "/tools/image-generate", "/platform/tools"), art: "dawn", value: metrics?.generatedImages },
    { word: "Agent", href: route(mode, "/agents", "/platform/agent"), art: "agents", note: <StatusPill status="dev" /> },
  ];
  return (
    <section aria-labelledby="home-hub">
      <SectionHead action={<ArrowLink href={route(mode, "/hub", "/platform/hub")}>AI Hub</ArrowLink>} id="home-hub" meta={sample ? <SampleTag /> : null}>AI Hub</SectionHead>
      <ul className="border-t border-border/12">
        {rows.map((row, index) => (
          <li className="enter" key={row.word} style={delay(140 + index * 50)}>
            <Link className="group flex items-center gap-3 border-b border-border/12 py-2.5" href={row.href} prefetch={false}>
              <ArtSurface className="h-9 w-8 shrink-0 rounded-[3px] transition-[width] duration-700 ease-out-expo group-hover:w-16" k={row.art} />
              <span className="text-[clamp(1.6rem,2.4vw,2.35rem)] font-medium leading-none tracking-[-.04em] transition-transform duration-700 ease-out-expo group-hover:translate-x-1">{row.word}</span>
              <span className="ml-1 flex min-w-0 items-center gap-2">{row.note}</span>
              <span className="ml-auto text-[clamp(1.1rem,1.6vw,1.5rem)] font-medium tabular-nums tracking-[-.03em] text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
                {row.value === undefined ? "" : `(${String(row.value).padStart(2, "0")})`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectsStrip({ projects, mode }: { projects: PlatformProject[]; mode: ShellMode }) {
  const base = route(mode, "/projects", "/platform/projects");
  const shown = projects.slice(0, 3);
  return (
    <section aria-labelledby="home-projects" className="mt-16">
      <SectionHead action={<ArrowLink href={base}>全部项目</ArrowLink>} id="home-projects" meta={<><StatusPill status="dev" /><SampleTag>演示状态 · 示例项目</SampleTag></>}>我的项目</SectionHead>
      <div className="grid gap-x-4 gap-y-10 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-4">
        {shown.map((project, index) => <ProjectCard href={`${base}/${project.slug}`} index={index} key={project.slug} project={project} />)}
        <NewProjectTile href={`${base}/new`} index={shown.length} />
      </div>
    </section>
  );
}

const pathSteps: { n: string; title: string; detail: string; status: CapabilityStatus; live: string; demo: string; icon: typeof FolderPlus }[] = [
  { n: "01", title: "创建项目", detail: "名称、类别与可见性；Manifest 随输入实时生成。", status: "dev", live: "/projects/new", demo: "/platform/projects/new", icon: FolderPlus },
  { n: "02", title: "校验与发布", detail: "按 P0.5 契约校验 Manifest，草稿经独立审核后封存为不可变版本。", status: "dev", live: "/developer", demo: "/platform/developer", icon: ShieldCheck },
  { n: "03", title: "授权与运行", detail: "使用者逐项授权能力；运行异步执行，结果仅本人可见。", status: "planned", live: "/connections", demo: "/platform/connections", icon: KeyRound },
];

export function PlatformPath({ mode }: { mode: ShellMode }) {
  return (
    <section aria-labelledby="home-path" className="mt-16">
      <SectionHead id="home-path">平台路径</SectionHead>
      <div className="grid gap-0.5 min-[821px]:grid-cols-3">
        {pathSteps.map((step, index) => (
          <Link className="enter group flex min-h-[13rem] flex-col rounded-card bg-surface p-5 transition-colors duration-500 hover:bg-surface-muted" href={route(mode, step.live, step.demo)} key={step.n} prefetch={false} style={delay(100 + index * 80)}>
            <span className="flex items-start justify-between gap-3">
              <span className="text-[clamp(2rem,3vw,2.75rem)] font-medium leading-none tracking-[-.05em] tabular-nums text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">{step.n}</span>
              <StatusPill status={step.status} />
            </span>
            <span className="mt-auto pt-8">
              <span className="flex items-center gap-2 text-[1.0625rem] font-medium tracking-[-.015em]"><step.icon aria-hidden="true" className="size-4" />{step.title}<LoopArrow className="ml-auto text-sm text-muted-foreground group-hover:text-foreground" /></span>
              <span className="mt-1.5 block text-[.8125rem] leading-5 text-muted-foreground">{step.detail}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const boundaries: [string, string, string][] = [
  ["项目可见性", "私有 · 不公开列出 · 公开", "决定谁能看见项目本身"],
  ["你的数据", "仅你可见", "公开项目不会公开你的输入与结果"],
  ["运行授权", "逐项、可撤销", "每个能力单独授权，撤销后立即拒绝新运行"],
  ["模型凭据", "从不交给项目作者", "开发者只能经平台代理调用，拿不到原始密钥"],
];

export function PrivacyBand({ mode }: { mode: ShellMode }) {
  return (
    <section className="mt-16 grid gap-8 rounded-card bg-forest p-6 text-[hsl(var(--paper))] min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] min-[1024px]:gap-12 min-[1024px]:p-10">
      <div className="flex min-w-0 flex-col">
        <Lock aria-hidden="true" className="size-5 text-lime" />
        <h2 className="mt-5 text-[clamp(1.75rem,3vw,2.75rem)] font-medium leading-[1.08] tracking-[-.035em] text-lime">隐私不是一个开关，<br />而是四条分开的边界。</h2>
        <p className="mt-4 max-w-[30rem] text-sm leading-6 text-[hsl(var(--paper)/.72)]">平台化不会改变你的数据边界。项目、数据、授权与凭据分别治理，并由服务端身份与所有权校验保护。</p>
        <div className="mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-8 text-sm">
          <Link className="group inline-flex items-center gap-2" href={route(mode, "/connections", "/platform/connections")} prefetch={false}><span className="link-grow">连接与授权</span><LoopArrow /></Link>
          <Link className="group inline-flex items-center gap-2" href={route(mode, "/account", "/login")} prefetch={false}><span className="link-grow">{mode === "demo" ? "登录后查看账户与隐私" : "账户与隐私"}</span><LoopArrow /></Link>
        </div>
      </div>
      <dl className="self-end border-t border-[hsl(var(--paper)/.16)]">
        {boundaries.map(([title, value, detail], index) => (
          <div className={cn("enter grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-[hsl(var(--paper)/.16)] py-4")} key={title} style={delay(120 + index * 60)}>
            <dt className="min-w-0">
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-1 block text-[.75rem] text-[hsl(var(--paper)/.6)]">{detail}</span>
            </dt>
            <dd className="text-right text-[.8125rem] text-lime">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
