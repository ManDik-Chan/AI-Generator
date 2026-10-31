import Link from "next/link";
import { FileCheck2, FolderPlus } from "lucide-react";

import type { ShellMode } from "@/components/layout/navigation";
import { DemoNotice, PageIntro, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { ProjectsBrowser } from "@/features/platform/components/projects-browser";
import { runStatusMeta, visibilityMeta } from "@/features/platform/labels";
import type { WorkspaceRun } from "@/features/platform/source";
import type { PlatformProject, Visibility } from "@/features/platform/types";

export function ProjectsIndex({ projects, runs, mode }: { projects: PlatformProject[]; runs: WorkspaceRun[]; mode: ShellMode }) {
  const base = mode === "demo" ? "/platform/projects" : "/projects";
  const developer = mode === "demo" ? "/platform/developer" : "/developer";
  return (
    <div className="pb-6">
      <PageIntro
        actions={
          <>
            <Button asChild size="lg"><Link href={`${base}/new`} prefetch={false}><FolderPlus className="size-4" />新建项目</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href={`${developer}/integrate#manifest`} prefetch={false}><FileCheck2 className="size-4" />校验 Manifest</Link></Button>
          </>
        }
        description="项目是平台的一级实体：一个成果页、一组不可变版本、一份明确的能力清单。可以只展示、不运行，也可以在授权后提供可交互的能力。"
        kicker="项目 · Projects"
        meta={<StatusPill status="dev" />}
        title={["你的项目，", "从草稿到发布。"]}
      />
      <DemoNotice className="mb-10">Project Registry 尚未部署：以下是示例项目，筛选、运行与设置都可以操作，但不会保存。</DemoNotice>

      <ProjectsBrowser base={base} projects={projects} />

      <section aria-labelledby="projects-runs" className="mt-20">
        <SectionHead id="projects-runs" meta={<span className="text-caption">测试 Adapter · 合成数据</span>}>最近运行</SectionHead>
        <div className="scroll-x">
          <table className="w-full min-w-[40rem] border-collapse text-left text-[.8125rem]">
            <thead>
              <tr className="border-b border-border/12 text-[.75rem] text-muted-foreground">
                <th className="py-2.5 pr-4 font-medium" scope="col">项目</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">运行</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">状态</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">开始</th>
                <th className="py-2.5 font-medium" scope="col">备注</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr className="border-b border-border/10" key={run.id}>
                  <td className="py-3 pr-4"><Link className="link-grow font-medium" href={`${base}/${run.projectSlug}#runs`} prefetch={false}>{run.project}</Link></td>
                  <td className="py-3 pr-4 font-code text-[.75rem] text-muted-foreground">{run.id}<span className="block">{run.capability}</span></td>
                  <td className="py-3 pr-4"><ToneBadge dot tone={runStatusMeta[run.status].tone}>{runStatusMeta[run.status].label}</ToneBadge></td>
                  <td className="py-3 pr-4 text-muted-foreground">{run.started}</td>
                  <td className="py-3 text-muted-foreground">{run.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="projects-visibility" className="mt-20">
        <SectionHead id="projects-visibility">可见性如何工作</SectionHead>
        <div className="grid gap-0.5 min-[821px]:grid-cols-3">
          {(["PRIVATE", "UNLISTED", "PUBLIC"] as Visibility[]).map((key, index) => (
            <div className="enter flex min-h-[11rem] flex-col rounded-card bg-surface p-5" key={key} style={delay(80 + index * 70)}>
              <span className="flex items-center justify-between gap-2"><span className="text-[1.25rem] font-medium tracking-[-.02em]">{visibilityMeta[key].label}</span><span className="font-code text-[.6875rem] text-muted-foreground">{key}</span></span>
              <p className="mt-auto pt-6 text-[.8125rem] leading-5 text-muted-foreground">{visibilityMeta[key].detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-[48rem] text-[.75rem] leading-5 text-muted-foreground">可见性只作用于项目本身。使用者的输入、运行结果与模型凭据是独立的私有资源，不会因为项目公开而公开；项目作者也无权默认读取。</p>
      </section>
    </div>
  );
}
