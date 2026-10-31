"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageIntro, SectionHead, ToneBadge } from "@/components/platform/primitives";
import { Mono } from "@/features/developer-console/components/desk-kit";
import { GateBlock, ListBody, MoreRows, ReadOnlyNotice, RefreshButton, SlotBody } from "@/features/developer-console/components/registry-kit";
import { useNow, useRegistryOverview } from "@/features/developer-console/components/registry-provider";
import { formatClock, visibilityLabels } from "@/features/developer-console/labels";
import { roleLabels } from "@/features/developer-console/permissions";
import type { QualificationDTO } from "@/features/developer-console/registry/contract";
import type { OverviewSnapshot } from "@/features/developer-console/registry/store";
import { actionLabel, formatExpiry, orderProjects, orderQualifications } from "@/features/developer-console/registry/view";

export function RegistryWorkbench({ base, mockHref }: { base: string; mockHref: string }) {
  const { snapshot, store } = useRegistryOverview();
  const now = useNow(15_000);
  return <RegistryWorkbenchView base={base} mockHref={mockHref} now={now} onLoadMore={() => void store.loadMore("projects")} onRefresh={() => void store.refresh()} snapshot={snapshot} />;
}

export function QualificationList({ items, now, empty }: { items: QualificationDTO[]; now: number; empty: string }) {
  if (!items.length) return <p className="text-[.8125rem] text-muted-foreground">{empty}</p>;
  return (
    <ul className="border-t border-border/12">
      {orderQualifications(items).map((item) => {
        const left = Date.parse(item.expiresAt) - now;
        return (
          <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-border/12 py-2.5" key={item.action}>
            <span className="min-w-0 text-[.8125rem] font-medium">{actionLabel(item.action)}</span>
            <span className={left > 0 ? "text-right text-[.75rem]" : "text-right text-[.75rem] text-destructive-foreground"}>{left > 0 ? formatExpiry(left) : "按本机时间已到期，重新读取以确认"}</span>
            <Mono className="text-muted-foreground">{item.action}</Mono>
            <span className="text-right text-[.6875rem] text-muted-foreground" title={item.expiresAt}>至 {formatClock(item.expiresAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function RegistryWorkbenchView({ snapshot, base, mockHref, now, onRefresh, onLoadMore }: {
  snapshot: OverviewSnapshot; base: string; mockHref: string; now: number; onRefresh: () => void; onLoadMore: () => void;
}) {
  return (
    <div className="pb-6">
      <PageIntro
        actions={<RefreshButton blockedUntil={snapshot.blockedUntil} lastRefresh={snapshot.lastRefresh} onRefresh={onRefresh} refreshing={snapshot.refreshing} />}
        description="以你当前登录的身份读取 Registry：你所在的项目、草稿与审核、不可变版本、发布历史与发布申请，以及你自己的平台操作资格。这个模式只读，不提供任何写入命令。"
        kicker="开发者控制台 · Registry 只读"
        meta={<ToneBadge dot tone="success">真实数据</ToneBadge>}
        title={["你的 Registry 项目，", "按真实权限读取。"]}
      />

      <ReadOnlyNotice className="mb-14" />

      {snapshot.gate ? <GateBlock gate={snapshot.gate} mockHref={mockHref} returnPath={base} /> : (
        <div className="space-y-20">
          <section aria-labelledby="rg-qualifications">
            <SectionHead id="rg-qualifications" meta={<ToneBadge tone="neutral">只描述读取时刻</ToneBadge>}>我的平台操作资格</SectionHead>
            <div className="grid gap-x-10 gap-y-6 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div>
                <SlotBody scope="overview" slot={snapshot.qualifications}>
                  {(items) => <QualificationList empty="你目前没有任何有效的平台操作资格。" items={items} now={now} />}
                </SlotBody>
              </div>
              <p className="text-[.75rem] leading-5 text-muted-foreground">
                每项资格单独授予、单独到期；有效期取内部操作员身份与该项资格中较早的一个。这里只列出你自己的资格。资格只是三道门中的一道：它不代表某个对象的命令可以执行，命令仍要独立核对会话、项目角色、独立性、期限与 ETag。读取需要 READ_DRAFT 或 READ_RELEASE，二者互不替代。
              </p>
            </div>
          </section>

          <section aria-labelledby="rg-projects">
            <SectionHead id="rg-projects" meta={<ToneBadge tone="success">Registry</ToneBadge>}>我的项目</SectionHead>
            <ListBody
              empty={<p className="text-[.8125rem] text-muted-foreground">你还不是任何未归档项目的有效成员。</p>}
              scope="overview"
              slot={snapshot.projects}
            >
              {(items) => (
                <ul aria-label="我的 Registry 项目" className="border-t border-border/12">
                  {orderProjects(items).map((project) => (
                    <li className="grid gap-x-6 gap-y-3 border-b border-border/12 py-5 min-[900px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] min-[900px]:items-center" key={project.id}>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[.9375rem] font-medium tracking-[-.01em]">
                          <span className="font-code">/{project.slug}</span>
                          <ToneBadge tone={visibilityLabels[project.visibility].tone}>{visibilityLabels[project.visibility].label}</ToneBadge>
                        </p>
                        <Mono className="mt-1 block text-muted-foreground">{project.id}</Mono>
                      </div>
                      <p className="flex flex-wrap items-center gap-1 text-[.75rem] text-muted-foreground">
                        我的角色：{project.roles.map((role) => <ToneBadge key={role} tone={role === "OWNER" ? "ink" : "neutral"}>{roleLabels[role]}</ToneBadge>)}
                      </p>
                      <Link className="group inline-flex h-10 items-center gap-1.5 justify-self-start rounded-full border border-foreground/25 px-4 text-[.8125rem] font-medium transition-colors duration-300 hover:bg-foreground hover:text-background min-[900px]:justify-self-end" href={`${base}/projects/${project.id}`} prefetch={false}>
                        只读查看<ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5" />
                        <span className="sr-only">：/{project.slug}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </ListBody>
            <MoreRows onMore={onLoadMore} orderedBy=" slug " scope="overview" slot={snapshot.projects} />
          </section>
        </div>
      )}
    </div>
  );
}
