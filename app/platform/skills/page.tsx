import type { Metadata } from "next";

import { BlockLabel, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { SkillCatalog, SkillManager } from "@/features/platform-preview/components/skill-catalog";
import { DemoBadge } from "@/features/platform-preview/components/status-badge";
import { platformModules } from "@/features/platform-preview/navigation";

export const metadata: Metadata = { title: "Skills 能力模块" };

const principles = [
  ["可复用", "一次定义，在对话、Agent 与项目中重复使用。"],
  ["可授权", "每个 Skill 声明所需权限，启用前清楚列出数据去向。"],
  ["可组合", "Agent 的 Worker 可以按需调用 Skill，而不是写死在提示词里。"],
] as const;

export default function PlatformSkillsPage() {
  const current = platformModules[3];
  return (
    <div className="pb-6">
      <PreviewHeader
        description="Skills 会把常用能力封装成带权限声明的模块，供对话、Agent 与项目调用。Skills 本身仍在规划中，没有注册表或安装流程；其中一部分底层能力已经以 Tools 的形式上线。"
        module={current}
        title="把能力封装成可复用的模块。"
      />

      <section aria-labelledby="skill-principles" className="grid gap-0.5 min-[821px]:grid-cols-3">
        <h2 className="sr-only" id="skill-principles">设计原则</h2>
        {principles.map(([title, detail], index) => (
          <div className="rounded-card bg-surface p-4 min-[821px]:p-5" key={title}>
            <p className="text-[.6875rem] tabular-nums text-muted-foreground">0{index + 1}</p>
            <p className="mt-3 text-card-title">{title}</p>
            <p className="mt-1 text-caption">{detail}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="skill-catalog" className="mt-14">
        <BlockLabel id="skill-catalog" meta={<DemoBadge />}>能力目录</BlockLabel>
        <SkillCatalog />
      </section>

      <section aria-labelledby="skill-manager" className="mt-14 rounded-card bg-surface p-4 min-[821px]:p-5">
        <BlockLabel id="skill-manager" meta={<DemoBadge />}>管理</BlockLabel>
        <SkillManager />
      </section>
    </div>
  );
}
