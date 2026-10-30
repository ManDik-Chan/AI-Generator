import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ShieldCheck, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlockLabel } from "@/features/platform-preview/components/blocks";
import { ModuleCard } from "@/features/platform-preview/components/module-card";
import { DemoBadge, SampleBadge, StatusBadge } from "@/features/platform-preview/components/status-badge";
import { modeLabels, previewAgentRuns, runStatusLabels } from "@/features/platform-preview/data/agent";
import { draftStateLabels, previewProjects, visibilityLabels } from "@/features/platform-preview/data/projects";
import { hubModules, platformModules } from "@/features/platform-preview/navigation";
import { statusMeta, type CapabilityStatus } from "@/features/platform-preview/status";

export const metadata: Metadata = { title: { absolute: "平台预览 · AI-Generator" } };

const roadmap: { status: CapabilityStatus; items: [string, string][] }[] = [
  { status: "live", items: [["Workspace 个人工作台", "登录后的控制中心、快速启动与最近对话"], ["Chat · Persona · Memory", "流式对话、专属人格与可信长期记忆"], ["Tools", "文本工具、图片理解、图片生成与多 Agent 头脑风暴"]] },
  { status: "dev", items: [["Agent 模式", "Planner + 动态 Worker + 协调器，Draft 验收中"], ["Projects Registry", "8 个实体的数据模型与权限，独立分支中，未部署"]] },
  { status: "planned", items: [["Skills", "可复用、可授权的能力模块"], ["项目展示与开发者控制台", "公开项目页、版本发布与文档"], ["自带模型凭据（BYOK）", "加密保管与受控调用，先完成安全设计"]] },
];

export default function PlatformOverviewPage() {
  return (
    <div className="pb-6">
      <section className="flex flex-col gap-8 pb-10 pt-2 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between min-[1024px]:pb-14 min-[1024px]:pt-6">
        <div className="min-w-0 max-w-[50rem]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[.8125rem] font-medium">AI Workspace · 统一控制台<span aria-hidden="true" className="ml-1.5 text-muted-foreground">↓</span></p>
            <DemoBadge />
          </div>
          <h1 className="mt-4 text-balance text-[clamp(2.5rem,5.2vw,5rem)] font-medium leading-[1.02] tracking-[-.04em]">
            <span className="block">一个工作台，</span>
            <span className="block">连接项目、Agent 与 Skills。</span>
          </h1>
          <p className="mt-5 max-w-[38rem] text-body text-muted-foreground">AI-Generator 正从私人 AI 助手升级为统一 AI 工作平台。这里是平台控制台的公开预览：浏览各模块、示例项目与 Agent 编排；已上线的 Chat、Persona、Memory 与 Tools 登录后即可真实使用。</p>
        </div>
        <div className="flex flex-col gap-2 min-[521px]:flex-row min-[1024px]:shrink-0">
          <Button asChild size="lg"><Link href="/platform/projects" prefetch={false}>浏览项目<ArrowUpRight className="size-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/platform/agent" prefetch={false}><Workflow className="size-4" />查看 Agent 编排</Link></Button>
        </div>
      </section>

      <div className="rule-draw mb-10" />

      <section aria-labelledby="platform-modules">
        <BlockLabel id="platform-modules" meta={<span className="text-caption">平台层</span>}>平台模块</BlockLabel>
        <div className="grid items-stretch gap-0.5 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {platformModules.map((module, index) => <ModuleCard key={module.key} module={module} number={`0${index + 1}`} />)}
        </div>
      </section>

      <section aria-labelledby="hub-modules" className="mt-10">
        <BlockLabel id="hub-modules" meta={<span className="text-caption">基础能力 · 已上线</span>}>AI Hub</BlockLabel>
        <div className="grid items-stretch gap-0.5 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {hubModules.map((module, index) => <ModuleCard key={module.key} module={module} number={`0${index + 5}`} />)}
        </div>
      </section>

      <div className="mt-14 grid gap-x-0.5 gap-y-10 min-[1024px]:grid-cols-2">
        <section aria-labelledby="overview-projects">
          <BlockLabel action={<Link className="link-grow text-xs text-muted-foreground hover:text-foreground" href="/platform/projects" prefetch={false}>全部项目</Link>} id="overview-projects" meta={<SampleBadge />}>项目</BlockLabel>
          <div className="border-t border-border/14">
            {previewProjects.map((project) => (
              <Link className="group grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border/14 py-3" href={`/platform/projects/${project.slug}`} key={project.slug} prefetch={false}>
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: project.tint }} />
                <span className="min-w-0">
                  <span className="link-grow block w-fit max-w-full truncate text-sm font-medium">{project.name}</span>
                  <span className="mt-1 block truncate text-caption">{visibilityLabels[project.visibility]} · {draftStateLabels[project.draftState]} · v{project.version}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:translate-x-1 group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        </section>
        <section aria-labelledby="overview-runs" className="min-[1024px]:pl-6">
          <BlockLabel action={<Link className="link-grow text-xs text-muted-foreground hover:text-foreground" href="/platform/agent" prefetch={false}>全部运行</Link>} id="overview-runs" meta={<SampleBadge />}>Agent 运行</BlockLabel>
          <div className="border-t border-border/14">
            {previewAgentRuns.map((run) => {
              const done = run.workers.filter((worker) => worker.status === "COMPLETE").length;
              return (
                <Link className="group grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border/14 py-3" href={`/platform/agent/${run.id}`} key={run.id} prefetch={false}>
                  <span className="min-w-0">
                    <span className="link-grow block w-fit max-w-full truncate text-sm font-medium">{run.problem}</span>
                    <span className="mt-1 block truncate text-caption">{modeLabels[run.mode]} · {runStatusLabels[run.status]} · Worker {done}/{run.workers.length}</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:translate-x-1 group-hover:text-foreground" />
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section aria-labelledby="overview-roadmap" className="mt-14">
        <BlockLabel id="overview-roadmap">发展方向</BlockLabel>
        <div className="grid gap-0.5 min-[821px]:grid-cols-3">
          {roadmap.map((column) => (
            <div className="rounded-card bg-surface p-4 min-[821px]:p-5" key={column.status}>
              <div className="flex items-center justify-between gap-3"><StatusBadge status={column.status} /><span className="text-caption">{statusMeta[column.status].description}</span></div>
              <ul className="mt-5 space-y-4">
                {column.items.map(([title, detail]) => <li key={title}><p className="text-sm font-medium">{title}</p><p className="mt-1 text-caption">{detail}</p></li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 flex flex-col gap-5 rounded-card bg-forest p-6 text-[hsl(42_31%_94%)] min-[521px]:flex-row min-[521px]:items-end min-[521px]:justify-between min-[821px]:p-8">
        <div className="min-w-0 max-w-[42rem]">
          <ShieldCheck aria-hidden="true" className="size-5 text-lime" />
          <h2 className="mt-4 text-[clamp(1.5rem,2.6vw,2.25rem)] font-medium leading-tight tracking-[-.03em] text-lime">平台化不改变数据边界。</h2>
          <p className="mt-3 text-sm leading-6 text-[hsl(42_31%_94%/.75)]">项目可见性、用户数据与运行授权分别治理：公开项目不会让你的对话或结果变成公开内容。本预览不读取任何账户或数据库。</p>
        </div>
        <Link className="group inline-flex shrink-0 items-center gap-2 text-sm text-[hsl(42_31%_94%)]" href="/login" prefetch={false}><span className="link-grow">登录工作台</span><ArrowRight aria-hidden="true" className="size-4 transition-transform duration-500 ease-out-expo group-hover:translate-x-1" /></Link>
      </section>
    </div>
  );
}
