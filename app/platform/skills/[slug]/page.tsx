import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlockLabel, FactList, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { SkillSettings } from "@/features/platform-preview/components/skill-settings";
import { DemoBadge, StatusBadge } from "@/features/platform-preview/components/status-badge";
import { getPreviewSkill, previewSkills } from "@/features/platform-preview/data/skills";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return previewSkills.map((skill) => ({ slug: skill.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const skill = getPreviewSkill((await params).slug);
  return { title: skill ? `${skill.name} · Skill` : "Skill" };
}

export default async function PlatformSkillPage({ params }: Props) {
  const skill = getPreviewSkill((await params).slug);
  if (!skill) notFound();

  return (
    <div className="pb-6">
      <PreviewHeader
        actions={skill.liveTool ? <Button asChild size="lg" variant="outline"><Link href={skill.liveTool.href} prefetch={false}>使用已上线的「{skill.liveTool.label}」<ArrowUpRight className="size-4" /></Link></Button> : undefined}
        back={{ href: "/platform/skills", label: "全部 Skills" }}
        description={skill.summary}
        status="planned"
        title={skill.name}
      />

      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(20rem,1fr)]">
        <section aria-labelledby="skill-facts" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="skill-facts">说明</BlockLabel>
          <FactList rows={[
            ["类别", skill.category],
            ["Skill 封装", <StatusBadge key="pack" status="planned" />],
            ["底层能力", <span className="inline-flex flex-wrap items-center justify-end gap-1.5" key="cap"><StatusBadge status={skill.capability} />{skill.liveTool ? <span className="text-caption">{skill.liveTool.label}</span> : null}</span>],
            ["输入", skill.inputs.join("、")],
            ["输出", skill.outputs.join("、")],
            ["使用方", skill.usedBy.join("、")],
          ]} />
        </section>
        <section aria-labelledby="skill-settings" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="skill-settings" meta={<DemoBadge />}>管理</BlockLabel>
          <SkillSettings skill={skill} />
        </section>
      </div>
    </div>
  );
}
