"use client";

import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

import { Kicker, ToneBadge } from "@/components/platform/primitives";
import { Facts, Mono, Panel } from "@/features/developer-console/components/desk-kit";
import { ErrorNote, GateBlock, ListBody, MoreRows, ReadOnlyNotice, ReadRow, RefreshButton, SlotBody } from "@/features/developer-console/components/registry-kit";
import { useNow, useRegistryProject } from "@/features/developer-console/components/registry-provider";
import { QualificationList } from "@/features/developer-console/components/registry-workbench";
import { draftStateMeta, formatClock, formatRemaining, requestStateMeta, reviewStateMeta, visibilityLabels } from "@/features/developer-console/labels";
import { roleLabels } from "@/features/developer-console/permissions";
import type { DraftRead, ReleaseRecordDTO } from "@/features/developer-console/registry/contract";
import type { ProjectListKey, ProjectSnapshot } from "@/features/developer-console/registry/store";
import {
  WRITE_ACTIONS, actionLabel, draftAgreement, orderReleases, orderRequests, orderReviews, orderVersions, reviewBinding, shortDigest, shortId,
} from "@/features/developer-console/registry/view";

export function RegistryProjectDesk({ projectId, base, mockHref }: { projectId: string; base: string; mockHref: string }) {
  const { snapshot, store } = useRegistryProject(projectId);
  const now = useNow();
  return (
    <RegistryProjectView
      base={base}
      mockHref={mockHref}
      now={now}
      onLoadMore={(key) => void store.loadMore(key)}
      onRefresh={() => void store.refresh()}
      snapshot={snapshot}
    />
  );
}

function ChangedBadge({ changed }: { changed: boolean }) {
  return changed ? <ToneBadge dot tone="info">自上次读取后已变化</ToneBadge> : null;
}

function PayloadSummary({ draft }: { draft: DraftRead }) {
  const { manifest, presentation, documentation } = draft.payload;
  const kinds = presentation.sections.reduce<Record<string, number>>((count, section) => ({ ...count, [section.kind]: (count[section.kind] ?? 0) + 1 }), {});
  return (
    <div className="mt-6 border-t border-border/12 pt-5">
      <p className="text-[.9375rem] font-medium">{manifest.name}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-[.8125rem] leading-6 text-muted-foreground">{manifest.summary}</p>
      <Facts
        className="mt-4"
        items={[
          ["Manifest 版本", <Mono key="v">v{manifest.version}</Mono>],
          ["类别 · 目标可见性", <span key="c"><Mono>{manifest.category}</Mono> · {visibilityLabels[manifest.visibility].label}</span>],
          ["能力", <span className="flex flex-wrap gap-1" key="cap">{manifest.capabilities.map((capability) => <Mono key={capability}>{capability}</Mono>)}</span>],
          ["研究声明", `${manifest.researchClaims.length} 条`],
          ["展示章节", presentation.sections.length ? Object.entries(kinds).map(([kind, count]) => `${kind} × ${count}`).join(" · ") : "无"],
          ["文档", `${documentation.length} 份`],
        ]}
      />
      <p className="mt-3 text-[.6875rem] leading-4 text-muted-foreground">资产 ID 只是同项目内的引用，不是下载地址；这个模式不读取、不展示任何资产内容。</p>
    </div>
  );
}

function DraftPanel({ snapshot }: { snapshot: ProjectSnapshot }) {
  const { draftHead, draft } = snapshot;
  const agreement = draftAgreement(draftHead, draft);
  return (
    <Panel id="draft" meta={<><ChangedBadge changed={draftHead.changed} /><ToneBadge tone="neutral">READ_DRAFT</ToneBadge></>} title="草稿">
      <SlotBody scope="draft" slot={draftHead}>
        {(head) => (
          <>
            <Facts
              items={[
                ["Draft", <Mono key="d">{head.id}</Mono>],
                ["状态", <span className="inline-flex flex-wrap items-center gap-2" key="s"><ToneBadge tone={draftStateMeta[head.state].tone}>{draftStateMeta[head.state].label}</ToneBadge><span className="text-muted-foreground">{draftStateMeta[head.state].detail}</span></span>],
                ["Revision", <Mono key="r">rev {head.revision}</Mono>],
                ["ETag", <Mono key="e">{draftHead.etag}</Mono>],
                ["内容哈希（服务端 JCS-SHA256）", head.contentHash ? <Mono key="h">{head.contentHash}</Mono> : <span className="text-muted-foreground" key="h">无：草稿内容尚未初始化或无效</span>],
              ]}
            />
            {agreement === "changed" ? (
              <p className="mt-4 rounded-control bg-warning-subtle px-4 py-3 text-[.75rem] leading-5 text-warning-foreground" role="status">
                草稿头与草稿内容是两次独立读取，它们之间草稿发生了变化（ID、revision、ETag 或内容哈希不一致）。重新读取以得到一致的结果。
              </p>
            ) : null}
          </>
        )}
      </SlotBody>
      {draftHead.data ? (
        draft.error?.code === "DRAFT_UNINITIALIZED" ? (
          <p className="mt-6 border-t border-border/12 pt-5 text-[.8125rem] leading-6 text-muted-foreground">
            <span className="font-code">409 DRAFT_UNINITIALIZED</span> · 这是 B1 创建的空草稿，还没有经过一次合法编辑，因此没有完整的 DraftDTO。
          </p>
        ) : (
          <div className="mt-6">
            <SlotBody scope="draft" slot={draft}>{(data) => <PayloadSummary draft={data} />}</SlotBody>
          </div>
        )
      ) : null}
    </Panel>
  );
}

function ReviewsPanel({ snapshot, now, onMore }: { snapshot: ProjectSnapshot; now: number; onMore: () => void }) {
  const head = snapshot.draftHead.data;
  return (
    <Panel id="review" meta={<ToneBadge tone="neutral">READ_DRAFT</ToneBadge>} title="当前草稿的审核">
      <ListBody empty={<p className="text-[.8125rem] text-muted-foreground">当前草稿还没有提交过审核。</p>} scope="draft" slot={snapshot.reviews}>
        {(items) => (
          <ul className="border-t border-border/12">
            {orderReviews(items).map((review) => {
              const binding = reviewBinding(review, head);
              const left = Date.parse(review.expiresAt) - now;
              const live = review.effectiveState === "PENDING" || review.effectiveState === "APPROVED";
              return (
                <li className="space-y-2 border-b border-border/12 py-4" key={review.id}>
                  <p className="flex flex-wrap items-center gap-2 text-[.8125rem]">
                    <ToneBadge tone={reviewStateMeta[review.effectiveState].tone}>{reviewStateMeta[review.effectiveState].label}</ToneBadge>
                    {review.decision !== review.effectiveState ? <span className="text-[.75rem] text-muted-foreground">历史决定 <Mono>{review.decision}</Mono></span> : null}
                    {review.submittedByViewer ? <ToneBadge tone="ink">由你提交</ToneBadge> : null}
                    {binding === "current" ? <ToneBadge tone="success">绑定当前草稿内容</ToneBadge> : binding === "differs" ? <ToneBadge tone="neutral">与当前草稿内容不同</ToneBadge> : null}
                  </p>
                  <Facts
                    items={[
                      ["Review", <Mono key="id">{review.id}</Mono>],
                      ["绑定", <span key="b"><Mono>rev {review.draftRevision}</Mono> · <Mono>{shortDigest(review.contentHash, 16)}</Mono></span>],
                      ["期限", <span key="x" title={review.expiresAt}>{formatClock(review.expiresAt)}{live ? <span className="ml-2 font-code tabular-nums text-muted-foreground">{formatRemaining(left)}</span> : null}</span>],
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </ListBody>
      <MoreRows onMore={onMore} orderedBy=" revision（新→旧）" scope="draft" slot={snapshot.reviews} />
      <p className="mt-4 text-[.6875rem] leading-4 text-muted-foreground">有效状态由服务端在读取时计算。「由你提交」是相对当前账户的布尔值，响应中没有提交人或审核人身份。封存（SEALED）是审核来源记录，不是发布授权。</p>
    </Panel>
  );
}

function releaseLabel(release: ReleaseRecordDTO, currentId: string | null | undefined) {
  if (release.state === "WITHDRAWN") return { label: "已撤回", tone: "neutral" as const };
  if (currentId === undefined) return { label: "已发布", tone: "info" as const };
  return release.id === currentId ? { label: "当前发布", tone: "success" as const } : { label: "已被替换", tone: "neutral" as const };
}

function VersionsPanel({ snapshot, onMore }: { snapshot: ProjectSnapshot; onMore: () => void }) {
  const releases = snapshot.releases.items;
  const currentId = snapshot.releaseHead.data?.currentReleaseId;
  const currentVersionId = currentId ? releases.find((release) => release.id === currentId)?.versionId : undefined;
  return (
    <Panel id="versions" meta={<ToneBadge tone="neutral">READ_DRAFT</ToneBadge>} title="不可变版本">
      <ListBody empty={<p className="text-[.8125rem] text-muted-foreground">还没有封存过版本。</p>} scope="draft" slot={snapshot.versions}>
        {(items) => (
          <ul className="border-t border-border/12">
            {orderVersions(items).map((version) => (
              <li className="grid gap-x-4 gap-y-1 border-b border-border/12 py-3 min-[640px]:grid-cols-[6rem_minmax(0,1fr)_auto] min-[640px]:items-center" key={version.id}>
                <span className="font-code text-[.9375rem] font-medium">v{version.version}</span>
                <span className="min-w-0 space-y-0.5">
                  <Mono className="block">{shortDigest(version.contentHash, 20)} · {version.hashAlgorithm}</Mono>
                  <span className="block text-[.6875rem] text-muted-foreground">Version <Mono>{shortId(version.id)}</Mono> · 来自审核 <Mono>{shortId(version.reviewId)}</Mono></span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-[.75rem] text-muted-foreground min-[640px]:justify-end">
                  {currentVersionId === version.id ? <ToneBadge tone="success">当前发布的版本</ToneBadge> : null}
                  <span title={version.createdAt}>封存于 {formatClock(version.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </ListBody>
      <MoreRows onMore={onMore} orderedBy="封存时间（新→旧）" scope="draft" slot={snapshot.versions} />
    </Panel>
  );
}

function ReleasePanel({ snapshot, now, onMore }: { snapshot: ProjectSnapshot; now: number; onMore: (key: ProjectListKey) => void }) {
  const head = snapshot.releaseHead;
  const currentId = head.data ? head.data.currentReleaseId : undefined;
  return (
    <Panel id="releases" meta={<><ChangedBadge changed={head.changed} /><ToneBadge tone="neutral">READ_RELEASE</ToneBadge></>} title="发布">
      <SlotBody scope="release" slot={head}>
        {(data) => (
          <Facts
            items={[
              ["当前 Release", data.currentReleaseId ? <Mono key="c">{data.currentReleaseId}</Mono> : <span className="text-muted-foreground" key="c">无</span>],
              ["项目可见性", <ToneBadge key="v" tone={visibilityLabels[data.visibility].tone}>{visibilityLabels[data.visibility].label}</ToneBadge>],
              ["发布头 ETag", <Mono key="e">{head.etag}</Mono>],
            ]}
          />
        )}
      </SlotBody>

      <h3 className="mt-8 text-sm font-medium">发布历史</h3>
      <div className="mt-3">
        <ListBody empty={<p className="text-[.8125rem] text-muted-foreground">还没有发布记录。</p>} scope="release" slot={snapshot.releases}>
          {(items) => (
            <ul className="border-t border-border/12">
              {orderReleases(items).map((release) => {
                const state = releaseLabel(release, currentId);
                return (
                  <li className="grid gap-x-4 gap-y-1 border-b border-border/12 py-3 min-[640px]:grid-cols-[6rem_minmax(0,1fr)_auto] min-[640px]:items-center" key={release.id}>
                    <span className="font-code text-[.9375rem] font-medium">v{release.version}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-2 text-[.75rem]">
                      <ToneBadge tone={state.tone}>{state.label}</ToneBadge>
                      <span className="text-muted-foreground">{release.intent === "ROLLBACK" ? "回滚" : release.intent === "PUBLISH" ? "发布" : "早期记录（无申请意图）"}</span>
                      <span className="text-muted-foreground">批准时可见性 {visibilityLabels[release.visibilityAtApproval].label}</span>
                      <Mono className="text-muted-foreground">{shortDigest(release.contentHash)}</Mono>
                    </span>
                    <span className="text-[.75rem] text-muted-foreground min-[640px]:text-right">
                      <span className="block" title={release.publishedAt}>发布于 {formatClock(release.publishedAt)}</span>
                      {release.withdrawnAt ? <span className="block" title={release.withdrawnAt}>撤回于 {formatClock(release.withdrawnAt)}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </ListBody>
        <MoreRows onMore={() => onMore("releases")} orderedBy="发布时间（新→旧）" scope="release" slot={snapshot.releases} />
      </div>

      <h3 className="mt-8 text-sm font-medium">发布申请</h3>
      <div className="mt-3">
        <ListBody empty={<p className="text-[.8125rem] text-muted-foreground">还没有发布申请。</p>} scope="release" slot={snapshot.requests}>
          {(items) => (
            <ul className="border-t border-border/12">
              {orderRequests(items).map((request) => {
                const left = Date.parse(request.expiresAt) - now;
                return (
                  <li className="space-y-2 border-b border-border/12 py-4" key={request.id}>
                    <p className="flex flex-wrap items-center gap-2 text-[.8125rem]">
                      <span className="font-code font-medium">v{request.version}</span>
                      <span className="text-[.75rem] text-muted-foreground">{request.intent === "ROLLBACK" ? "回滚" : "发布"}</span>
                      <ToneBadge tone={requestStateMeta[request.state].tone}>{requestStateMeta[request.state].label}</ToneBadge>
                      {request.expired ? <ToneBadge tone="neutral">已过期</ToneBadge> : null}
                      {request.stale ? <ToneBadge tone="neutral">绑定已过时</ToneBadge> : null}
                      {request.requestedByViewer ? <ToneBadge tone="ink">由你申请</ToneBadge> : null}
                      {request.approvedByViewer ? <ToneBadge tone="ink">由你批准</ToneBadge> : null}
                    </p>
                    <Facts
                      items={[
                        ["申请", <Mono key="id">{request.id}</Mono>],
                        ["目标", <span key="t">{visibilityLabels[request.visibility].label}{request.targetReleaseId ? <> · 回滚到 <Mono>{shortId(request.targetReleaseId)}</Mono></> : null}</span>],
                        ["批准", request.approvalId ? <Mono key="a">{request.approvalId}</Mono> : <span className="text-muted-foreground" key="a">尚无</span>],
                        ["期限", <span key="x" title={request.expiresAt}>{formatClock(request.expiresAt)}{!request.expired && request.state !== "CONSUMED" ? <span className="ml-2 font-code tabular-nums text-muted-foreground">{formatRemaining(left)}</span> : null}</span>],
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </ListBody>
        <MoreRows onMore={() => onMore("requests")} orderedBy="到期时间（新→旧）" scope="release" slot={snapshot.requests} />
      </div>
      <p className="mt-4 text-[.6875rem] leading-4 text-muted-foreground">
        申请状态是不可变事实（待批准 / 已批准 / 已执行）；「已过期」按数据库时间计算，「绑定已过时」表示策略、授权 epoch、项目 revision 或当前发布头已变化。它们都不代表现在可以执行。发布历史中的「已发布」也不等于当前对外分发。
      </p>
    </Panel>
  );
}

function ReadOnlyCommands({ snapshot, now }: { snapshot: ProjectSnapshot; now: number }) {
  const granted = new Map((snapshot.project.data?.effectiveActions ?? []).map((item) => [item.action, item.expiresAt]));
  return (
    <section aria-labelledby="rg-commands" className="rounded-card bg-surface p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium" id="rg-commands"><Lock aria-hidden="true" className="size-4" />写入命令 · 不可用</h2>
      <p className="mt-1 text-[.6875rem] leading-4 text-muted-foreground">Registry 还没有内部 HTTP 写接口，这个模式也不会模拟写入成功。下面只对照你在本项目的读取时资格。</p>
      <ul className="mt-3 text-[.75rem]">
        {WRITE_ACTIONS.map((action) => {
          const expiresAt = granted.get(action);
          return (
            <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border/12 py-1.5 last:border-b-0" key={action}>
              <span className="min-w-0">{actionLabel(action)}</span>
              <span className="text-right text-muted-foreground">{expiresAt && Date.parse(expiresAt) > now ? "有资格 · 不可执行" : "无资格 · 不可执行"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RegistryProjectView({ snapshot, base, mockHref, now, onRefresh, onLoadMore }: {
  snapshot: ProjectSnapshot; base: string; mockHref: string; now: number; onRefresh: () => void; onLoadMore: (key: ProjectListKey) => void;
}) {
  const project = snapshot.project;
  const slug = project.data?.slug;
  const returnPath = `${base}/projects/${snapshot.projectId}`;
  const missing = project.error?.code === "NOT_FOUND" && snapshot.releaseHead.error?.code === "NOT_FOUND";

  return (
    <div className="pb-6">
      <Link className="enter group mb-6 inline-flex items-center gap-1.5 text-[.8125rem] text-muted-foreground hover:text-foreground" href={base} prefetch={false}>
        <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-0.5" /><span className="link-grow">项目与资格</span>
      </Link>

      <header className="flex flex-col gap-5 pb-8 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between">
        <div className="min-w-0">
          <Kicker>Registry 只读 · Project</Kicker>
          <h1 className="mt-3 break-all text-[clamp(2rem,4.2vw,3.5rem)] font-medium leading-[1.05] tracking-[-.04em]">{slug ? `/${slug}` : "项目"}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[.75rem]">
            <Mono className="text-muted-foreground">{snapshot.projectId}</Mono>
            {project.data ? <ToneBadge tone={visibilityLabels[project.data.visibility].tone}>{visibilityLabels[project.data.visibility].label}</ToneBadge> : null}
            <ToneBadge dot tone="success">Registry · 只读</ToneBadge>
          </p>
        </div>
        <RefreshButton blockedUntil={snapshot.blockedUntil} lastRefresh={snapshot.lastRefresh} onRefresh={onRefresh} refreshing={snapshot.refreshing} />
      </header>

      <ReadOnlyNotice className="mb-6" />

      {snapshot.gate ? <GateBlock gate={snapshot.gate} mockHref={mockHref} returnPath={returnPath} /> : missing ? (
        <ErrorNote error={project.error!} scope="draft" />
      ) : (
        <div className="grid gap-0.5 min-[1180px]:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-0.5">
            <Panel id="project" meta={<ToneBadge tone="neutral">READ_DRAFT</ToneBadge>} title="项目与本项目内的有效资格">
              <SlotBody scope="draft" slot={project}>
                {(data) => (
                  <>
                    <Facts
                      items={[
                        ["Slug", <Mono key="s">/{data.slug}</Mono>],
                        ["我的角色", <span className="flex flex-wrap gap-1" key="r">{data.roles.map((role) => <ToneBadge key={role} tone={role === "OWNER" ? "ink" : "neutral"}>{roleLabels[role]}</ToneBadge>)}</span>],
                      ]}
                    />
                    <div className="mt-5">
                      <QualificationList empty="你在这个项目里没有有效的操作资格。" items={data.effectiveActions} now={now} />
                    </div>
                    <p className="mt-3 text-[.6875rem] leading-4 text-muted-foreground">这里是你自己的有效平台资格与你在本项目角色的交集，描述读取时刻的身份与角色门，不代表某个具体命令可以执行。</p>
                  </>
                )}
              </SlotBody>
            </Panel>
            <DraftPanel snapshot={snapshot} />
            <ReviewsPanel now={now} onMore={() => onLoadMore("reviews")} snapshot={snapshot} />
            <VersionsPanel onMore={() => onLoadMore("versions")} snapshot={snapshot} />
            <ReleasePanel now={now} onMore={onLoadMore} snapshot={snapshot} />
          </div>

          <aside aria-label="只读模式与读取记录" className="space-y-0.5 min-[1180px]:sticky min-[1180px]:top-[calc(var(--shell-header-height,4rem)+1rem)] min-[1180px]:max-h-[calc(100dvh-var(--shell-header-height,4rem)-2rem)] min-[1180px]:self-start min-[1180px]:overflow-y-auto">
            <ReadOnlyCommands now={now} snapshot={snapshot} />
            <section aria-labelledby="rg-reads" className="rounded-card bg-surface p-5">
              <h2 className="text-sm font-medium" id="rg-reads">读取记录</h2>
              <p className="mt-1 text-[.6875rem] leading-4 text-muted-foreground">每个 GET 单独鉴权、单独成功或失败；多次读取之间不是同一个快照。只有草稿、审核与发布头携带 ETag。</p>
              <ul className="mt-3">
                <ReadRow label="GET …/projects/:id" slot={project} />
                <ReadRow label="GET …/draft/head" slot={snapshot.draftHead} />
                <ReadRow label="GET …/draft" slot={snapshot.draft} />
                <ReadRow label="GET …/drafts/:id/reviews" slot={snapshot.reviews} />
                <ReadRow label="GET …/versions" slot={snapshot.versions} />
                <ReadRow label="GET …/release/head" slot={snapshot.releaseHead} />
                <ReadRow label="GET …/releases" slot={snapshot.releases} />
                <ReadRow label="GET …/release-requests" slot={snapshot.requests} />
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

