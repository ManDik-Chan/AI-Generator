import type { Metadata } from "next";
import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlockLabel, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { ProjectList } from "@/features/platform-preview/components/project-list";
import { SampleBadge } from "@/features/platform-preview/components/status-badge";
import { registryEntities } from "@/features/platform-preview/data/projects";
import { platformModules } from "@/features/platform-preview/navigation";

export const metadata: Metadata = { title: "Projects 项目" };

const lifecycle = [
  ["草稿", "所有者或编辑修改展示内容与资料"],
  ["审核", "独立审核人检查内容、资产与可见性"],
  ["封存版本", "审核通过的内容成为不可变 Version"],
  ["发布", "发布人创建 Release；可撤回，不可覆盖"],
] as const;

export default function PlatformProjectsPage() {
  const current = platformModules[1];
  return (
    <div className="pb-6">
      <PreviewHeader
        actions={<Button disabled size="lg" title="Registry 尚未部署，不能创建项目"><FolderPlus className="size-4" />新建项目 · 开发中</Button>}
        description="Project 是平台的一级对象：成员、资料、对话、Agent 运行、文档与版本发布都归属于项目。数据模型与权限设计在独立分支中验收，尚未部署；下方均为示例项目。"
        module={current}
        title="以项目组织你的 AI 工作。"
      />

      <section aria-labelledby="project-list-title">
        <BlockLabel id="project-list-title" meta={<SampleBadge />}>项目列表</BlockLabel>
        <ProjectList />
      </section>

      <div className="mt-14 grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-labelledby="project-lifecycle" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="project-lifecycle">发布流程</BlockLabel>
          <ol className="mt-4 space-y-4">
            {lifecycle.map(([title, detail], index) => (
              <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" key={title}>
                <span className="grid size-8 place-items-center rounded-full bg-background text-xs tabular-nums">{index + 1}</span>
                <span><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-caption">{detail}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-caption">可见性分三档：私有（仅成员）、不公开列出（凭链接可见公开内容）、公开（可被发现）。项目公开不代表其中的对话或运行结果公开。</p>
        </section>
        <section aria-labelledby="project-entities" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="project-entities" meta={<span className="text-caption">Registry 数据模型 · 开发中</span>}>8 个实体</BlockLabel>
          <dl className="mt-2 border-t border-border/14">
            {registryEntities.map(([name, detail]) => (
              <div className="grid gap-1 border-b border-border/14 py-3 min-[521px]:grid-cols-[11rem_minmax(0,1fr)] min-[521px]:gap-4" key={name}>
                <dt className="font-mono text-xs">{name}</dt>
                <dd className="text-caption">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
