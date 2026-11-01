"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cpu, MonitorSmartphone, Search, Server, TestTubeDiagonal } from "lucide-react";

import { LoopArrow, ToneBadge } from "@/components/platform/primitives";
import { experimentStatusMeta, experimentStatusOrder, siteMeta } from "@/features/research/labels";
import type { ExperimentSummary } from "@/features/research/source";
import type { ExecutionSite, ExperimentStatus } from "@/features/research/types";
import { cn } from "@/lib/utils";

const siteIcon: Record<ExecutionSite, typeof Server> = { browser: MonitorSmartphone, ci: TestTubeDiagonal, server: Server, gpu: Cpu };

type StatusFilter = ExperimentStatus | "all";

const chip = (active: boolean) => cn(
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[.8125rem] font-medium transition-colors duration-300",
  active ? "bg-foreground text-background" : "border border-border/14 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
);

/**
 * Directory of every experiment record, filtered on the client. Filters are mirrored in the
 * query string (?status=…&project=…) so a filtered view can be shared; nothing is fetched.
 */
export function ExperimentRegistry({ experiments, projects }: { experiments: ExperimentSummary[]; projects: { slug: string; title: string }[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [project, setProject] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantedStatus = params.get("status");
    const wantedProject = params.get("project");
    if (wantedStatus && (experimentStatusOrder as string[]).includes(wantedStatus)) setStatus(wantedStatus as ExperimentStatus);
    if (wantedProject && projects.some((item) => item.slug === wantedProject)) setProject(wantedProject);
  }, [projects]);

  const update = (next: { status?: StatusFilter; project?: string }) => {
    const nextStatus = next.status ?? status;
    const nextProject = next.project ?? project;
    setStatus(nextStatus);
    setProject(nextProject);
    const url = new URL(window.location.href);
    if (nextStatus === "all") url.searchParams.delete("status"); else url.searchParams.set("status", nextStatus);
    if (nextProject === "all") url.searchParams.delete("project"); else url.searchParams.set("project", nextProject);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const inProject = useMemo(() => experiments.filter((item) => project === "all" || item.projectSlug === project), [experiments, project]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inProject.filter((item) => (status === "all" || item.status === status)
      && (!q || `${item.id} ${item.title} ${item.projectTitle} ${item.claimTopics.join(" ")}`.toLowerCase().includes(q)));
  }, [inProject, status, query]);

  return (
    <div>
      <div className="flex flex-col gap-3 min-[1024px]:flex-row min-[1024px]:items-center min-[1024px]:justify-between">
        <div aria-label="按状态筛选" className="scroll-x -mx-1 flex gap-1.5 px-1" role="group">
          <button aria-pressed={status === "all"} className={chip(status === "all")} onClick={() => update({ status: "all" })} type="button">
            全部<span className="tabular-nums opacity-70">{inProject.length}</span>
          </button>
          {experimentStatusOrder.map((key) => (
            <button aria-pressed={status === key} className={chip(status === key)} key={key} onClick={() => update({ status: key })} type="button">
              {experimentStatusMeta[key].label}<span className="tabular-nums opacity-70">{inProject.filter((item) => item.status === key).length}</span>
            </button>
          ))}
        </div>
        <label className="flex h-11 w-full items-center gap-2 rounded-full border border-border/14 bg-surface-raised px-4 transition-[border-color,box-shadow] duration-300 focus-within:border-foreground focus-within:shadow-[0_0_0_3px_hsl(var(--lime)/.55)] min-[1024px]:w-[20rem]">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <input aria-label="搜索实验" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" onChange={(event) => setQuery(event.target.value)} placeholder="编号、标题、声明…" value={query} />
        </label>
      </div>

      <div aria-label="按项目筛选" className="scroll-x -mx-1 mt-3 flex gap-1.5 px-1" role="group">
        {[{ slug: "all", title: "全部项目" }, ...projects].map((item) => (
          <button aria-pressed={project === item.slug} className={cn("h-8 shrink-0 rounded-full px-3 text-[.75rem] font-medium transition-colors duration-300", project === item.slug ? "bg-surface-muted text-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground)/.35)]" : "text-muted-foreground hover:bg-surface hover:text-foreground")} key={item.slug} onClick={() => update({ project: item.slug })} type="button">{item.title}</button>
        ))}
      </div>

      <p aria-live="polite" className="mt-6 text-caption">显示 {shown.length} / {experiments.length} 个实验</p>

      <div aria-hidden="true" className="mt-2 hidden grid-cols-[6rem_minmax(0,1.7fr)_minmax(0,1fr)_9.5rem_10rem_1rem] gap-x-6 border-b border-border/20 pb-2 text-[.75rem] text-muted-foreground min-[1024px]:grid">
        <span>编号</span><span>实验与检验的声明</span><span>项目</span><span>执行位置</span><span>状态</span><span />
      </div>
      <ul className="border-t border-border/12 min-[1024px]:border-t-0">
        {shown.map((item) => {
          const Icon = siteIcon[item.site];
          return (
            <li key={item.href}>
              <Link className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b border-border/12 py-4 transition-colors duration-300 hover:bg-surface/60 min-[1024px]:grid-cols-[6rem_minmax(0,1.7fr)_minmax(0,1fr)_9.5rem_10rem_1rem] min-[1024px]:items-center min-[1024px]:gap-x-6" href={item.href} prefetch={false}>
                <span className="font-code text-[.75rem] font-medium min-[1024px]:text-[.8125rem]">{item.id}</span>
                <span className="col-span-2 row-start-2 min-w-0 min-[1024px]:col-span-1 min-[1024px]:row-start-auto">
                  <span className="block text-[.9375rem] font-medium tracking-[-.01em]">{item.title}</span>
                  {item.claimTopics.length ? <span className="mt-0.5 block text-[.75rem] text-muted-foreground">检验：{item.claimTopics.join("、")}</span> : null}
                </span>
                <span className="min-w-0 text-[.75rem] text-muted-foreground min-[1024px]:text-[.8125rem]">{item.projectTitle}</span>
                <span className="inline-flex items-center gap-1.5 justify-self-end text-[.75rem] text-muted-foreground min-[1024px]:justify-self-auto">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />{siteMeta[item.site].label}
                </span>
                <span className="col-start-2 row-start-1 flex flex-col items-end gap-1 min-[1024px]:col-start-auto min-[1024px]:row-start-auto min-[1024px]:items-start">
                  <ToneBadge dot tone={experimentStatusMeta[item.status].tone}>{experimentStatusMeta[item.status].label}</ToneBadge>
                  {item.verdict ? <span className="text-[.6875rem] text-muted-foreground">参考判定 {item.verdict.passed}/{item.verdict.total} 项通过</span> : null}
                </span>
                <LoopArrow className="hidden text-muted-foreground min-[1024px]:inline-grid" />
              </Link>
            </li>
          );
        })}
      </ul>
      {!shown.length ? <p className="py-16 text-center text-sm text-muted-foreground">没有符合筛选条件的实验。</p> : null}
    </div>
  );
}
