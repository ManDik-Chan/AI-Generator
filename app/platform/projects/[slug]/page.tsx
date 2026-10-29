import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot, FileText, FolderOpen, FolderTree, GitBranch, Layers, MessageSquareText, Plug, ShieldCheck, Users } from "lucide-react";

import { BlockLabel, FactList, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { SampleBadge, StatusBadge } from "@/features/platform-preview/components/status-badge";
import { previewAgentRuns } from "@/features/platform-preview/data/agent";
import {
  assetStateLabels, draftStateLabels, getPreviewProject, previewProjects, roleLabels, visibilityLabels, type DraftState,
} from "@/features/platform-preview/data/projects";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return previewProjects.map((project) => ({ slug: project.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = getPreviewProject((await params).slug);
  return { title: project ? project.name : "项目" };
}

const structureIcons: Record<string, typeof FolderOpen> = {
  overview: Layers, chats: MessageSquareText, agent: Bot, assets: FolderOpen, docs: FileText, versions: GitBranch, endpoint: Plug,
};
const flow: DraftState[] = ["DRAFT", "IN_REVIEW", "PUBLISHED"];

export default async function PlatformProjectPage({ params }: Props) {
  const project = getPreviewProject((await params).slug);
  if (!project) notFound();
  const runs = previewAgentRuns.filter((run) => run.project === project.slug);
  const step = flow.indexOf(project.draftState);

  return (
    <div className="pb-6">
      <PreviewHeader
        back={{ href: "/platform/projects", label: "全部项目" }}
        description={project.summary}
        status="dev"
        title={project.name}
      />

      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.45fr)_minmax(19rem,1fr)]">
        <section aria-labelledby="project-structure" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="project-structure" meta={<SampleBadge />}>工作空间结构</BlockLabel>
          <div className="mt-4 flex items-center gap-2 text-sm font-medium"><FolderTree aria-hidden="true" className="size-4" /><span className="font-mono text-xs">/{project.slug}</span></div>
          <ul className="ml-2 mt-2 border-l border-border/16">
            {project.workspace.map((node) => {
              const Icon = structureIcons[node.key] ?? FolderOpen;
              return (
                <li className="relative py-2 pl-5 before:absolute before:left-0 before:top-[1.35rem] before:h-px before:w-3.5 before:bg-border/16" key={node.key}>
                  <div className="flex items-start gap-3 rounded-control bg-background/60 px-3 py-2.5">
                    <span className="premium-icon-tile mt-0.5 size-8 shrink-0 rounded-full"><Icon className="size-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{node.label}</span>{typeof node.count === "number" ? <span className="premium-chip min-h-0 px-2 py-0 tabular-nums">{node.count}</span> : null}</span>
                      <span className="mt-0.5 block text-caption">{node.detail}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid content-start gap-0.5">
          <section aria-labelledby="project-facts" className="rounded-card bg-surface p-4 min-[821px]:p-5">
            <BlockLabel id="project-facts">项目信息</BlockLabel>
            <FactList rows={[
              ["可见性", visibilityLabels[project.visibility]],
              ["草稿状态", draftStateLabels[project.draftState]],
              ["版本", `v${project.version}`],
              ["接入方式", project.integration === "SHOWCASE" ? "展示型（不运行代码）" : <span className="inline-flex items-center gap-1.5">远程 API <StatusBadge status="planned" /></span>],
              ["类别", project.category],
              ["更新", project.updated],
            ]} />
          </section>
          <section aria-labelledby="project-flow" className="rounded-card bg-surface p-4 min-[821px]:p-5">
            <BlockLabel id="project-flow">发布进度</BlockLabel>
            <ol className="mt-3 grid grid-cols-3 gap-1">
              {flow.map((state, index) => (
                <li className={cn("rounded-control px-2 py-2.5 text-center text-xs", index <= step ? "bg-foreground text-background" : "bg-background/60 text-muted-foreground")} key={state}>{draftStateLabels[state]}</li>
              ))}
            </ol>
            <p className="mt-3 text-caption">审核人不能是提交人；审核通过后内容封存为不可变版本，再由发布人发布。</p>
          </section>
        </div>
      </div>

      <div className="mt-0.5 grid gap-0.5 min-[1024px]:grid-cols-2">
        <section aria-labelledby="project-members" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="project-members" meta={<SampleBadge />}>成员与角色</BlockLabel>
          <ul className="border-t border-border/14">
            {project.members.map((member) => (
              <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border/14 py-3" key={member.name}>
                <span className="inline-flex items-center gap-2 text-sm"><Users aria-hidden="true" className="size-4 text-muted-foreground" />{member.name}</span>
                <span className="flex flex-wrap gap-1">{member.roles.map((role) => <span className="premium-chip" key={role}>{roleLabels[role]}</span>)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-caption"><ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />项目成员身份不授予平台管理权限，也不能读取其他成员的私人数据。</p>
        </section>
        <section aria-labelledby="project-assets" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="project-assets" meta={<SampleBadge />}>资料与资产</BlockLabel>
          {project.assets.length ? (
            <ul className="border-t border-border/14">
              {project.assets.map((asset) => (
                <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/14 py-3" key={asset.name}>
                  <span className="min-w-0"><span className="block truncate font-mono text-xs">{asset.name}</span><span className="mt-0.5 block text-caption">{asset.kind} · {asset.size}</span></span>
                  <span className={cn("premium-chip", asset.state === "APPROVED" && "bg-success-subtle text-success-foreground", asset.state === "QUARANTINED" && "bg-warning-subtle text-warning-foreground")}>{assetStateLabels[asset.state]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-control border border-dashed border-foreground/18 px-4 py-8 text-center text-caption">还没有资产。</p>}
        </section>
      </div>

      <div className="mt-0.5 grid gap-0.5 min-[1024px]:grid-cols-2">
        <section aria-labelledby="project-releases" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="project-releases" meta={<SampleBadge />}>版本与发布</BlockLabel>
          {project.releases.length ? (
            <ul className="border-t border-border/14">
              {project.releases.map((release) => (
                <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border/14 py-3" key={release.version}>
                  <span className="text-sm font-medium">v{release.version}</span>
                  <span className="text-caption">{release.note}</span>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-control border border-dashed border-foreground/18 px-4 py-8 text-center text-caption">尚未发布。审核通过前不会出现在任何公开页面。</p>}
          {project.docs.length ? <p className="mt-3 text-caption">文档：{project.docs.map((doc) => `${doc.title}（${doc.language}）`).join("、")}</p> : null}
        </section>
        <section aria-labelledby="project-runs" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="project-runs" meta={<SampleBadge />}>项目内的 Agent 运行</BlockLabel>
          {runs.length ? (
            <ul className="border-t border-border/14">
              {runs.map((run) => (
                <li key={run.id}><Link className="link-grow block border-b border-border/14 py-3 text-sm" href={`/platform/agent/${run.id}`} prefetch={false}>{run.problem}</Link></li>
              ))}
            </ul>
          ) : <p className="rounded-control border border-dashed border-foreground/18 px-4 py-8 text-center text-caption">这个示例项目没有 Agent 运行。</p>}
          <p className="mt-3 text-caption">把 Agent 运行与对话归档到项目是规划中的能力，当前真实运行只属于个人对话。</p>
        </section>
      </div>
    </div>
  );
}
