"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { ProjectCard } from "@/features/platform/components/project-card";
import { categoryLabels } from "@/features/platform/labels";
import type { PlatformProject, ProjectCategory } from "@/features/platform/types";
import { cn } from "@/lib/utils";

/** Search and category filter for the public directory. Client-side over public projects only. */
export function ExploreBrowser({ projects }: { projects: PlatformProject[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProjectCategory | "all">("all");
  const categories = useMemo(() => Array.from(new Set(projects.map((project) => project.category))), [projects]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) => (category === "all" || project.category === category)
      && (!q || `${project.name} ${project.tagline} ${project.tags.join(" ")}`.toLowerCase().includes(q)));
  }, [projects, query, category]);

  return (
    <div>
      <div className="flex flex-col gap-3 min-[821px]:flex-row min-[821px]:items-center min-[821px]:justify-between">
        <div aria-label="按类别筛选" className="scroll-x -mx-1 flex gap-1.5 px-1" role="group">
          {[{ key: "all" as const, label: "全部" }, ...categories.map((key) => ({ key, label: categoryLabels[key] }))].map((item) => (
            <button aria-pressed={category === item.key} className={cn("h-9 shrink-0 rounded-full px-3.5 text-[.8125rem] font-medium transition-colors duration-300", category === item.key ? "bg-foreground text-background" : "border border-border/14 text-muted-foreground hover:border-foreground/30 hover:text-foreground")} key={item.key} onClick={() => setCategory(item.key)} type="button">{item.label}</button>
          ))}
        </div>
        <label className="flex h-11 w-full items-center gap-2 rounded-full border border-border/14 bg-surface-raised px-4 transition-[border-color,box-shadow] duration-300 focus-within:border-foreground focus-within:shadow-[0_0_0_3px_hsl(var(--lime)/.55)] min-[821px]:w-[20rem]">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <input aria-label="搜索项目" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、标签…" value={query} />
        </label>
      </div>
      <div className="mt-8 grid gap-x-4 gap-y-12 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-3">
        {shown.map((project, index) => <ProjectCard href={`/explore/${project.slug}`} index={index} key={project.slug} project={project} showStates={false} />)}
      </div>
      {!shown.length ? <p className="py-16 text-center text-sm text-muted-foreground">没有找到匹配的公开项目。</p> : null}
    </div>
  );
}
