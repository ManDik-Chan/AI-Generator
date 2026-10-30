"use client";

import { useMemo, useState } from "react";

import { NewProjectTile, ProjectCard } from "@/features/platform/components/project-card";
import { draftStateMeta, visibilityMeta } from "@/features/platform/labels";
import type { DraftState, PlatformProject, Visibility } from "@/features/platform/types";
import { cn } from "@/lib/utils";

type Filter = "ALL" | DraftState | Visibility;

const filters: { key: Filter; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "DRAFT", label: draftStateMeta.DRAFT.label },
  { key: "IN_REVIEW", label: draftStateMeta.IN_REVIEW.label },
  { key: "PUBLISHED", label: draftStateMeta.PUBLISHED.label },
  { key: "PRIVATE", label: visibilityMeta.PRIVATE.label },
  { key: "UNLISTED", label: visibilityMeta.UNLISTED.label },
  { key: "PUBLIC", label: visibilityMeta.PUBLIC.label },
];

function matches(project: PlatformProject, filter: Filter) {
  if (filter === "ALL") return true;
  return project.draftState === filter || project.visibility === filter;
}

export function ProjectsBrowser({ projects, base }: { projects: PlatformProject[]; base: string }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const shown = useMemo(() => projects.filter((project) => matches(project, filter)), [projects, filter]);
  return (
    <div>
      <div aria-label="筛选项目" className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1" role="group">
        {filters.map((item, index) => {
          const count = projects.filter((project) => matches(project, item.key)).length;
          return (
            <button
              aria-pressed={filter === item.key}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[.8125rem] font-medium transition-colors duration-300",
                filter === item.key ? "bg-foreground text-background" : "border border-border/14 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                index === 4 && "ml-3",
              )}
              key={item.key}
              onClick={() => setFilter(item.key)}
              type="button"
            >
              {item.label}<span className="text-[.6875rem] tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-8 grid gap-x-4 gap-y-12 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-3">
        {shown.map((project, index) => <ProjectCard href={`${base}/${project.slug}`} index={index} key={project.slug} project={project} />)}
        {filter === "ALL" ? <NewProjectTile href={`${base}/new`} index={shown.length} /> : null}
      </div>
      {!shown.length ? <p className="py-16 text-center text-sm text-muted-foreground">没有符合条件的项目。</p> : null}
    </div>
  );
}
