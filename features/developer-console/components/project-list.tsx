"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { useConsole } from "@/features/developer-console/components/console-provider";
import { draftStateMeta, visibilityLabels } from "@/features/developer-console/labels";
import type { ProjectSummary } from "@/features/developer-console/model";
import { roleLabels } from "@/features/developer-console/permissions";

export function nextStep(summary: ProjectSummary) {
  if (summary.draftState === "DRAFT" && !summary.draftVersion) return "完成首次编辑";
  if (summary.draftState === "DRAFT") return `编辑 ${summary.draftVersion} 并提交审核`;
  if (summary.draftState === "IN_REVIEW") return summary.pendingReview ? `${summary.draftVersion} 等待独立审核` : `${summary.draftVersion} 可封存或撤回审核`;
  if (summary.draftState === "PUBLISHED") return summary.currentRelease === summary.latestVersion ? "开始下一版草稿" : `申请发布 ${summary.latestVersion}`;
  return "已归档";
}

/** The acting persona's projects with their pipeline position. Reads the live mock state. */
export function ProjectList({ base }: { base: string }) {
  const { summaries, personas, personaId } = useConsole();
  const persona = personas.find((item) => item.id === personaId);
  return (
    <ul className="border-t border-border/12" aria-label="我的项目">
      {summaries.map((summary) => {
        const member = summary.roles.length > 0;
        return (
          <li className="grid gap-x-6 gap-y-3 border-b border-border/12 py-5 min-[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] min-[900px]:items-center" key={summary.id}>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[.9375rem] font-medium tracking-[-.01em]">
                {summary.name}
                <ToneBadge tone={visibilityLabels[summary.visibility].tone}>{visibilityLabels[summary.visibility].label}</ToneBadge>
              </p>
              <p className="mt-1 font-code text-[.75rem] text-muted-foreground">/{summary.slug}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[.75rem]">
              <dt className="text-muted-foreground">草稿</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                <ToneBadge tone={draftStateMeta[summary.draftState].tone}>{draftStateMeta[summary.draftState].label}</ToneBadge>
                <span className="font-code text-muted-foreground">rev {summary.draftRevision}</span>
              </dd>
              <dt className="text-muted-foreground">当前发布</dt>
              <dd className="font-code">{summary.currentRelease ? `v${summary.currentRelease}` : "未发布"}</dd>
            </dl>
            <div className="min-w-0 text-[.8125rem]">
              <p className="font-medium">{nextStep(summary)}</p>
              <p className="mt-1 flex flex-wrap gap-1 text-[.75rem] text-muted-foreground">
                {member ? <>{persona?.name}：{summary.roles.map((role) => <ToneBadge key={role} tone={role === "OWNER" ? "ink" : "neutral"}>{roleLabels[role]}</ToneBadge>)}</> : <span>{persona?.name}不是该项目成员</span>}
              </p>
            </div>
            <Link className="group inline-flex h-10 items-center gap-1.5 justify-self-start rounded-full border border-foreground/25 px-4 text-[.8125rem] font-medium transition-colors duration-300 hover:bg-foreground hover:text-background min-[900px]:justify-self-end" href={`${base}/projects/${summary.slug}`} prefetch={false}>
              进入发布台<ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5" />
              <span className="sr-only">：{summary.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
