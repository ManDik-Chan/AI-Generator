import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, ShieldCheck, UserPlus } from "lucide-react";

import type { ShellMode } from "@/components/layout/navigation";
import { ArtSurface } from "@/components/platform/art";
import { DemoNotice, SampleTag, SectionHead, SpecRow, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { Tabs } from "@/components/platform/tabs";
import { Button } from "@/components/ui/button";
import { ArchitectureDiagram, CapabilityList, ClaimsList, DocsList, ReleasesTimeline } from "@/features/platform/components/sections";
import { RunSimulator } from "@/features/platform/components/run-simulator";
import { VisibilitySettings } from "@/features/platform/components/visibility-settings";
import { assetStateMeta, categoryLabels, draftStateMeta, formatVersion, integrationMeta, roleLabels, visibilityMeta } from "@/features/platform/labels";
import type { AssetState, DraftState, PlatformProject } from "@/features/platform/types";
import { cn } from "@/lib/utils";

const pipeline: DraftState[] = ["DRAFT", "IN_REVIEW", "PUBLISHED"];

function PublicationPipeline({ state }: { state: DraftState }) {
  const current = pipeline.indexOf(state);
  return (
    <div className="rounded-card bg-surface p-5">
      <p className="text-sm font-medium">发布流程</p>
      <ol className="mt-5 grid grid-cols-3 gap-1.5">
        {pipeline.map((step, index) => {
          const done = current >= index;
          return (
            <li key={step}>
              <span className={cn("flex h-10 items-center justify-center gap-1.5 rounded-full text-[.75rem] font-medium transition-colors duration-500", index === current ? "bg-foreground text-background" : done ? "bg-surface-raised text-foreground" : "border border-dashed border-foreground/20 text-muted-foreground")}>
                {done && index < current ? <Check aria-hidden="true" className="size-3.5" /> : null}{draftStateMeta[step].label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[.75rem] leading-5 text-muted-foreground">草稿提交后由独立审核人检查，审核人不能是提交人；通过后封存为不可变版本，再由发布人发布。发布可以撤回，但不能覆盖或复活。</p>
    </div>
  );
}

const assetColumns: AssetState[] = ["QUARANTINED", "VALIDATED", "APPROVED"];

function AssetsPanel({ project }: { project: PlatformProject }) {
  const others = project.assets.filter((asset) => !assetColumns.includes(asset.state));
  return (
    <div className="space-y-10">
      <div className="grid gap-0.5 min-[821px]:grid-cols-3">
        {assetColumns.map((state, index) => {
          const items = project.assets.filter((asset) => asset.state === state);
          return (
            <section className="flex min-h-[12rem] flex-col rounded-card bg-surface p-4" key={state}>
              <div className="flex items-center justify-between gap-2">
                <ToneBadge dot tone={assetStateMeta[state].tone}>{assetStateMeta[state].label}</ToneBadge>
                <span className="text-[.6875rem] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")} · {items.length}</span>
              </div>
              <p className="mt-2 text-[.75rem] leading-5 text-muted-foreground">{assetStateMeta[state].detail}</p>
              <ul className="mt-4 space-y-1.5">
                {items.map((asset) => (
                  <li className="rounded-control bg-surface-raised px-3 py-2.5" key={asset.name}>
                    <p className="truncate font-code text-[.75rem]">{asset.name}</p>
                    <p className="mt-0.5 text-[.6875rem] text-muted-foreground">{asset.mime} · {asset.size} · {asset.dataClass === "SYNTHETIC" ? "合成数据" : asset.dataClass === "PRIVATE" ? "私有" : "公开"}</p>
                  </li>
                ))}
                {!items.length ? <li className="rounded-control border border-dashed border-foreground/15 px-3 py-4 text-center text-[.75rem] text-muted-foreground">暂无</li> : null}
              </ul>
            </section>
          );
        })}
      </div>
      {others.length ? (
        <dl className="border-t border-border/12">
          {others.map((asset) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border/12 py-3" key={asset.name}>
              <dt><span className="font-code text-[.8125rem]">{asset.name}</span><span className="mt-0.5 block text-[.6875rem] text-muted-foreground">{assetStateMeta[asset.state].detail}</span></dt>
              <dd><ToneBadge tone={assetStateMeta[asset.state].tone}>{assetStateMeta[asset.state].label}</ToneBadge></dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="text-[.75rem] leading-5 text-muted-foreground">上传先进入隔离区，通过格式与内容校验后等待批准；只有已批准的资产可以出现在已发布版本中。真实医学影像默认会被拒绝。</p>
    </div>
  );
}

function MembersPanel({ project }: { project: PlatformProject }) {
  return (
    <div className="grid gap-10 min-[1024px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <ul className="border-t border-border/12">
        {project.members.map((member) => (
          <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border/12 py-4" key={member.name}>
            <span className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-surface text-[.8125rem] font-medium">{member.name.slice(-2)}</span>
              <span className="text-sm font-medium">{member.name}</span>
            </span>
            <span className="flex flex-wrap gap-1.5">{member.roles.map((role) => <ToneBadge key={role} tone={role === "OWNER" ? "ink" : "neutral"}>{roleLabels[role]}</ToneBadge>)}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-card bg-surface p-5">
        <ShieldCheck aria-hidden="true" className="size-5" />
        <p className="mt-4 text-sm font-medium">成员权限只在本项目内有效</p>
        <p className="mt-2 text-[.8125rem] leading-5 text-muted-foreground">成员身份不授予平台管理权限，也不能读取其他成员或使用者的私人数据。审核与发布是两个独立角色。</p>
        <Button className="mt-5" disabled size="sm" variant="outline"><UserPlus className="size-3.5" />邀请成员</Button>
        <p className="mt-2 text-[.6875rem] text-muted-foreground">演示状态：邀请需要 Registry 部署后开放。</p>
      </div>
    </div>
  );
}

export function ProjectConsole({ project, mode }: { project: PlatformProject; mode: ShellMode }) {
  const base = mode === "demo" ? "/platform/projects" : "/projects";
  const integration = integrationMeta[project.integration];
  const publicPage = project.visibility !== "PRIVATE";

  const tabs = [
    {
      id: "overview",
      label: "概览",
      content: (
        <div className="space-y-14">
          <div className="grid gap-x-10 gap-y-8 min-[1024px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-8">
              <p className="text-[clamp(1.25rem,2vw,1.6rem)] font-medium leading-[1.3] tracking-[-.02em]">{project.summary}</p>
              <PublicationPipeline state={project.draftState} />
            </div>
            <dl className="border-t border-border/12">
              <SpecRow label="可见性">{visibilityMeta[project.visibility].label}</SpecRow>
              <SpecRow label="状态">{draftStateMeta[project.draftState].label}</SpecRow>
              <SpecRow label="版本"><span className="font-code">{formatVersion(project.version)}</span></SpecRow>
              <SpecRow label="接入方式">{integration.level} · {integration.label}</SpecRow>
              <SpecRow label="类别">{categoryLabels[project.category]}</SpecRow>
              <SpecRow label="所有者">{project.owner}</SpecRow>
              <SpecRow label="更新">{project.updated}</SpecRow>
            </dl>
          </div>
          <CapabilityList project={project} />
          <ClaimsList project={project} />
        </div>
      ),
    },
    { id: "runs", label: "运行", count: project.runs.length, content: <RunSimulator capabilities={project.capabilities} initialRuns={project.runs} /> },
    { id: "assets", label: "资产", count: project.assets.length, content: <AssetsPanel project={project} /> },
    { id: "architecture", label: "架构", content: <ArchitectureDiagram project={project} /> },
    { id: "docs", label: "文档", count: project.docs.length, content: <DocsList project={project} /> },
    { id: "releases", label: "版本与发布", count: project.releases.length, content: <ReleasesTimeline project={project} /> },
    { id: "members", label: "成员", count: project.members.length, content: <MembersPanel project={project} /> },
    {
      id: "settings",
      label: "设置",
      content: (
        <div className="max-w-[56rem] space-y-12">
          <VisibilitySettings initial={project.visibility} />
          <section>
            <SectionHead>危险操作</SectionHead>
            <div className="flex flex-col gap-3 rounded-card border border-destructive/25 p-5 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
              <div><p className="text-sm font-medium">归档项目</p><p className="mt-1 text-[.75rem] text-muted-foreground">归档后不再接受新的运行与发布；slug 永不复用。</p></div>
              <Button disabled size="sm" variant="destructive">归档</Button>
            </div>
          </section>
        </div>
      ),
    },
  ];

  return (
    <div className="pb-6">
      <Link className="enter group mb-6 inline-flex items-center gap-1.5 text-[.8125rem] text-muted-foreground hover:text-foreground" href={base} prefetch={false}>
        <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-0.5" /><span className="link-grow">全部项目</span>
      </Link>

      <ArtSurface className="enter-media h-[clamp(9rem,22vw,16rem)] w-full rounded-card" k={project.art}>
        <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-2">
          <span className="rounded-full bg-[hsl(var(--paper)/.92)] px-3 py-1.5 font-code text-[.75rem] text-[hsl(var(--ink))]">/{project.slug}</span>
          <span className="rounded-full bg-[hsl(var(--ink)/.55)] px-2.5 py-1 text-[.6875rem] text-[hsl(var(--paper))] backdrop-blur-sm">{project.provenance === "real" ? "真实项目" : "示例项目"}</span>
        </div>
      </ArtSurface>

      <header className="mt-8 flex flex-col gap-6 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between">
        <div className="min-w-0">
          <div className="enter flex flex-wrap items-center gap-2" style={delay(80)}>
            <ToneBadge tone={visibilityMeta[project.visibility].tone}>{visibilityMeta[project.visibility].label}</ToneBadge>
            <ToneBadge tone={draftStateMeta[project.draftState].tone}>{draftStateMeta[project.draftState].label}</ToneBadge>
            <span className="font-code text-[.75rem] text-muted-foreground">{formatVersion(project.version)} · {integration.level} {integration.label}</span>
          </div>
          <h1 className="mt-3 text-[clamp(2.25rem,4.6vw,4rem)] font-medium leading-[1.04] tracking-[-.04em]"><span className="title-line"><span>{project.name}</span></span></h1>
          <p className="enter mt-3 max-w-[40rem] text-[.9375rem] leading-7 text-muted-foreground" style={delay(220)}>{project.tagline}</p>
        </div>
        <div className="enter flex flex-col gap-2 min-[521px]:flex-row min-[1024px]:shrink-0" style={delay(300)}>
          {publicPage ? <Button asChild variant="outline"><Link href={`/explore/${project.slug}`} prefetch={false}>查看公开页<ArrowUpRight className="size-4" /></Link></Button> : null}
          <Button asChild><a href="#runs">新建运行</a></Button>
        </div>
      </header>

      <DemoNotice className="mt-8" action={project.provenance === "sample" ? <SampleTag>示例项目</SampleTag> : <StatusPill status="dev" />}>
        Project Registry 尚未部署：这是项目控制台的完整界面，运行、设置与邀请只在本页模拟，不会保存，也不调用任何服务。
      </DemoNotice>

      <Tabs className="mt-10" items={tabs} label="项目控制台" />
    </div>
  );
}
