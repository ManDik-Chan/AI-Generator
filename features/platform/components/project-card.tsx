import Link from "next/link";

import { ArtSurface } from "@/components/platform/art";
import { LoopArrow, ToneBadge, delay } from "@/components/platform/primitives";
import { categoryLabels, draftStateMeta, formatVersion, integrationMeta, visibilityMeta } from "@/features/platform/labels";
import type { PlatformProject } from "@/features/platform/types";
import { cn } from "@/lib/utils";

/** Project card: procedural cover art, honest provenance chip, status line. */
export function ProjectCard({
  project,
  href,
  index = 0,
  showStates = true,
  className,
}: {
  project: PlatformProject;
  href: string;
  index?: number;
  /** Draft state and visibility matter to owners, not to Explore visitors. */
  showStates?: boolean;
  className?: string;
}) {
  const integration = integrationMeta[project.integration];
  return (
    <Link className={cn("enter group flex min-w-0 flex-col", className)} href={href} prefetch={false} style={delay(80 + index * 70)}>
      <ArtSurface className="aspect-[4/3] w-full rounded-card" k={project.art} zoom>
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="rounded-full bg-[hsl(var(--paper)/.92)] px-2.5 py-1 text-[.6875rem] font-medium leading-none text-[hsl(var(--ink))]">{categoryLabels[project.category]}</span>
          <span className="rounded-full bg-[hsl(var(--ink)/.55)] px-2 py-1 text-[.625rem] leading-none text-[hsl(var(--paper))] backdrop-blur-sm">{project.provenance === "real" ? "真实项目" : "示例项目"}</span>
        </div>
        <span className="absolute bottom-3 left-3 rounded-full bg-[hsl(var(--ink)/.55)] px-2 py-1 font-code text-[.625rem] leading-none text-[hsl(var(--paper))] backdrop-blur-sm">{integration.level} · {integration.label}</span>
      </ArtSurface>
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[1.0625rem] font-medium leading-snug tracking-[-.015em]"><span className="link-grow">{project.name}</span></p>
          <p className="mt-1 line-clamp-2 text-[.8125rem] leading-5 text-muted-foreground">{project.tagline}</p>
        </div>
        <LoopArrow className="mt-1 shrink-0 text-muted-foreground group-hover:text-foreground" dir="ur" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {showStates ? <ToneBadge tone={visibilityMeta[project.visibility].tone}>{visibilityMeta[project.visibility].label}</ToneBadge> : null}
        {showStates ? <ToneBadge tone={draftStateMeta[project.draftState].tone}>{draftStateMeta[project.draftState].label}</ToneBadge> : null}
        <span className="font-code text-[.6875rem] text-muted-foreground">{formatVersion(project.version)}</span>
        <span aria-hidden="true" className="text-muted-foreground/50">·</span>
        <span className="text-[.6875rem] text-muted-foreground">{project.updated}</span>
      </div>
    </Link>
  );
}

/** Dashed tile that starts the new-project flow. */
export function NewProjectTile({ href, index = 0 }: { href: string; index?: number }) {
  return (
    <Link className="enter group flex min-h-[14rem] flex-col justify-between rounded-card border border-dashed border-foreground/22 p-5 transition-colors duration-500 hover:border-foreground/50 hover:bg-surface" href={href} prefetch={false} style={delay(80 + index * 70)}>
      <span className="grid size-11 place-items-center rounded-full bg-lime text-xl text-[hsl(var(--ink))] transition-transform duration-700 ease-out-expo group-hover:rotate-90">+</span>
      <span>
        <span className="block text-[1.0625rem] font-medium tracking-[-.015em]">新建项目</span>
        <span className="mt-1 block text-[.8125rem] leading-5 text-muted-foreground">填写信息、选择可见性，实时生成并校验 Manifest。演示状态，不会保存。</span>
      </span>
    </Link>
  );
}
