"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Globe, Link2, Lock } from "lucide-react";

import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { draftStateLabels, previewProjects, visibilityLabels, type ProjectVisibility } from "@/features/platform-preview/data/projects";

const filters: { key: "ALL" | ProjectVisibility; label: string }[] = [
  { key: "ALL", label: "全部" }, { key: "PUBLIC", label: "公开" }, { key: "UNLISTED", label: "不公开列出" }, { key: "PRIVATE", label: "私有" },
];
const visibilityIcons = { PUBLIC: Globe, UNLISTED: Link2, PRIVATE: Lock } as const;

export function ProjectList() {
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("ALL");
  const shown = previewProjects.filter((project) => filter === "ALL" || project.visibility === filter);
  return (
    <div>
      <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
        <SegmentedControl label="按可见性筛选">
          {filters.map((item) => <Segment active={filter === item.key} key={item.key} onClick={() => setFilter(item.key)}>{item.label}</Segment>)}
        </SegmentedControl>
      </div>
      <div className="grid items-stretch gap-0.5 min-[640px]:grid-cols-2">
        {shown.map((project) => {
          const VisibilityIcon = visibilityIcons[project.visibility];
          return (
            <Link className="group flex min-h-[15rem] flex-col rounded-card bg-surface p-4 transition-colors duration-500 ease-out-expo hover:bg-surface-muted min-[821px]:p-5" href={`/platform/projects/${project.slug}`} key={project.slug} prefetch={false}>
              <span className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[.6875rem] font-medium text-[hsl(213_21%_10%)]" style={{ backgroundColor: project.tint }}>{project.category}</span>
                <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </span>
              <span className="mt-6 block text-[clamp(1.375rem,2.2vw,1.75rem)] font-medium leading-tight tracking-[-.03em]">{project.name}</span>
              <span className="mt-2 block max-w-[30rem] text-caption">{project.summary}</span>
              <span className="mt-auto flex flex-wrap gap-1.5 pt-6">
                <span className="premium-chip"><VisibilityIcon aria-hidden="true" className="size-3" />{visibilityLabels[project.visibility]}</span>
                <span className="premium-chip">{draftStateLabels[project.draftState]}</span>
                <span className="premium-chip">v{project.version}</span>
                <span className="premium-chip">{project.members.length} 位成员</span>
                <span className="premium-chip">{project.updated}</span>
              </span>
            </Link>
          );
        })}
      </div>
      {!shown.length ? <p className="rounded-card border border-dashed border-foreground/18 px-4 py-10 text-center text-sm text-muted-foreground">没有该可见性的示例项目。</p> : null}
    </div>
  );
}
