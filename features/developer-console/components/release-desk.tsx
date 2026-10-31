"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Clock3, RotateCcw, ShieldOff, ShieldCheck, Users } from "lucide-react";

import { EmptyBlock, Kicker, ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { newIdempotencyKey } from "@/features/developer-console/adapter";
import { Countdown, useConsole, useConsoleAdapter } from "@/features/developer-console/components/console-provider";
import type { DeskApi, DeskCommand, DeskResult, Gate } from "@/features/developer-console/components/desk-kit";
import { DraftPanel } from "@/features/developer-console/components/draft-panel";
import { ReleasesPanel, ReviewPanel, VersionsPanel } from "@/features/developer-console/components/pipeline-panels";
import { ProtocolLog } from "@/features/developer-console/components/protocol-log";
import { draftStateMeta, errorMeta, reviewStateMeta, successText, visibilityLabels } from "@/features/developer-console/labels";
import type { ConsoleCommand, ConsoleProjectView, ConsoleRole } from "@/features/developer-console/model";
import { requiredRoles, roleLabels, rolesAllow } from "@/features/developer-console/permissions";
import { cn } from "@/lib/utils";

type Stage = "project" | "draft" | "review" | "version" | "release";

function focusOf(view: ConsoleProjectView): { stage: Stage; text: string; deadline?: string } {
  const state = view.draft.head.state;
  const review = view.reviews[0];
  if (state === "DRAFT") return { stage: "draft", text: view.draft.dto ? "编辑并保存草稿，然后提交审核。" : "草稿还是 B1 创建的空记录：先完成首次合法编辑。" };
  if (state === "IN_REVIEW") {
    if (review?.effectiveState === "PENDING") return { stage: "review", text: "等待另一位具有审核角色的成员决定。", deadline: review.expiresAt };
    if (review?.effectiveState === "APPROVED") return { stage: "review", text: "审核已批准：封存为不可变版本。", deadline: review.expiresAt };
    return { stage: "review", text: "审核已被拒绝或已失效：撤回审核，修改后重新提交。" };
  }
  const open = view.releaseRequests.find((request) => request.state !== "CONSUMED");
  if (open) return { stage: "release", text: open.state === "PENDING" ? "发布申请等待独立批准。" : "批准已就绪：由原申请人执行。", deadline: open.expiresAt };
  const latest = view.versions.at(-1);
  const current = view.releases.find((release) => release.id === view.currentReleaseId);
  if (latest && current?.versionId !== latest.id) return { stage: "version", text: `为 v${latest.version} 申请发布，或开始下一版草稿。` };
  return { stage: "version", text: "当前版本已发布。开始下一版草稿，或撤回、回滚发布。" };
}

function Pipeline({ view }: { view: ConsoleProjectView }) {
  const focus = focusOf(view);
  const review = view.reviews[0];
  const latest = view.versions.at(-1);
  const current = view.releases.find((release) => release.id === view.currentReleaseId);
  const currentVersion = current ? view.versions.find((version) => version.id === current.versionId)?.version : null;
  const nodes: { key: Stage; label: string; value: string; detail: string; href: string }[] = [
    { key: "project", label: "项目", value: visibilityLabels[view.visibility].label, detail: `epoch ${view.authzEpoch} · rev ${view.revision}`, href: "#releases" },
    { key: "draft", label: "草稿", value: draftStateMeta[view.draft.head.state].label, detail: `rev ${view.draft.head.revision}${view.draft.dto ? ` · v${view.draft.dto.payload.manifest.version}` : " · 未初始化"}`, href: "#draft" },
    { key: "review", label: "审核", value: review ? reviewStateMeta[review.effectiveState].label : "未提交", detail: review ? `绑定 rev ${review.draftRevision}` : "—", href: "#review" },
    { key: "version", label: "版本", value: latest ? `v${latest.version}` : "无", detail: `${view.versions.length} 个不可变版本`, href: "#versions" },
    { key: "release", label: "发布", value: currentVersion ? `v${currentVersion}` : "未发布", detail: `${view.releases.length} 条发布记录`, href: "#releases" },
  ];
  return (
    <div className="rounded-card bg-surface p-4 min-[640px]:p-5">
      <ol aria-label="发布流程" className="grid grid-cols-2 gap-1.5 min-[640px]:grid-cols-5">
        {nodes.map((node, index) => {
          const active = node.key === focus.stage;
          return (
            <li className={cn("relative", index === nodes.length - 1 && "max-[639px]:col-span-2")} key={node.key}>
              <a
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-full flex-col rounded-control px-3.5 py-3 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                  active ? "bg-foreground text-background" : "bg-surface-raised hover:bg-surface-muted",
                )}
                href={node.href}
              >
                <span className={cn("flex items-center justify-between text-[.6875rem]", active ? "text-background/70" : "text-muted-foreground")}>
                  <span>{String(index + 1).padStart(2, "0")} · {node.label}</span>
                  {index < nodes.length - 1 ? <span aria-hidden="true" className="max-[639px]:hidden">→</span> : null}
                </span>
                <span className="mt-2 text-[.9375rem] font-medium tracking-[-.01em]">{node.value}</span>
                <span className={cn("mt-0.5 font-code text-[.6875rem]", active ? "text-background/70" : "text-muted-foreground")}>{node.detail}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[.8125rem]">
        <span className="font-medium">下一步</span>
        <span className="text-muted-foreground">{focus.text}</span>
        {focus.deadline ? <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[.6875rem]"><Clock3 aria-hidden="true" className="size-3" /><Countdown className="font-code tabular-nums" deadline={focus.deadline} /></span> : null}
      </p>
    </div>
  );
}

function ResultBanner({ last }: { last: DeskResult | null }) {
  return (
    <div aria-live="polite" className="min-h-0" role="status">
      {last ? (
        last.result.ok ? (
          <div className="rounded-control bg-success-subtle px-4 py-3 text-[.8125rem] text-success-foreground">
            <p className="font-medium">{last.result.response.replayed ? "重放成功：返回了原来的结果，没有产生新的效果" : successText[last.action]}</p>
            <p className="mt-0.5 break-all font-code text-[.6875rem] opacity-80">ETag {last.result.response.etag}</p>
          </div>
        ) : (
          <div className="rounded-control bg-destructive-subtle px-4 py-3 text-[.8125rem] text-destructive-foreground">
            <p className="font-medium"><span className="font-code">{last.result.error.status} {last.result.error.code}</span> · {errorMeta[last.result.error.code].title}</p>
            <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">{errorMeta[last.result.error.code].detail}</p>
            {last.result.error.code === "PRECONDITION_FAILED" && last.action === "EDIT_DRAFT" ? <p className="mt-1 text-[.75rem]">在草稿面板选择“载入最新”，再重新修改。</p> : null}
          </div>
        )
      ) : null}
    </div>
  );
}

export function ReleaseDesk({ slug, base, projectsBase }: { slug: string; base: string; projectsBase: string }) {
  const snapshot = useConsole();
  const adapter = useConsoleAdapter();
  const ownEtags = useRef(new Set<string>());
  const [last, setLast] = useState<DeskResult | null>(null);
  // Which button sent the command in flight, so its result can also be shown next to it.
  const origin = useRef<string | null>(null);
  const view = snapshot.views[slug];

  if (!view) return <EmptyBlock title="没有这个项目">Mock 数据里没有 /{slug}。</EmptyBlock>;

  const persona = snapshot.personas.find((item) => item.id === snapshot.personaId)!;
  const roles: ConsoleRole[] = view.members.find((member) => member.personaId === snapshot.personaId)?.roles ?? [];
  const qualified = snapshot.qualified[snapshot.personaId];
  const personaName = (id: string) => snapshot.personas.find((item) => item.id === id)?.name ?? id;
  const candidateFor = (action: ConsoleCommand["action"]) => {
    const member = view.members.find((item) => item.personaId !== snapshot.personaId && rolesAllow(item.roles, action) && snapshot.qualified[item.personaId]);
    return member ? snapshot.personas.find((item) => item.id === member.personaId) : undefined;
  };

  const api: DeskApi = {
    view, personaId: snapshot.personaId, roles, personas: snapshot.personas, now: snapshot.now, pending: snapshot.pending, last,
    gate(action, independence): Gate {
      if (!qualified) return { allowed: false, reason: `${persona.name}的平台操作资格已撤销`, suggest: candidateFor(action) };
      if (!rolesAllow(roles, action)) return { allowed: false, reason: `需要「${requiredRoles(action).map((role) => roleLabels[role]).join("」或「")}」角色`, suggest: candidateFor(action) };
      if (independence?.blocked) return { allowed: false, reason: independence.reason, suggest: independence.role === "REVIEWER" ? candidateFor(action) : undefined };
      return { allowed: true };
    },
    async send(partial: DeskCommand) {
      const command = { ...partial, projectId: view.id, idempotencyKey: partial.idempotencyKey ?? newIdempotencyKey(partial.action) } as ConsoleCommand;
      const from = origin.current;
      origin.current = null;
      const result = await adapter.execute(command);
      if (result.ok) ownEtags.current.add(result.response.etag);
      setLast({ action: command.action, result, origin: from });
      return result;
    },
    markOrigin: (id) => { origin.current = id; },
    switchPersona: (id) => adapter.tools?.setPersona(id),
    personaName,
  };

  const replay = async (seq: number) => {
    const result = await adapter.replay(seq);
    const entry = adapter.getSnapshot().log[0];
    if (result && entry) setLast({ action: entry.action, result, origin: null });
  };

  const tools = adapter.tools;
  const peer = view.members.find((member) => member.personaId !== snapshot.personaId && rolesAllow(member.roles, "EDIT_DRAFT"));
  const canSimulateEdit = Boolean(view.draft.dto) && view.draft.head.state === "DRAFT" && Boolean(peer) && snapshot.pending === null;
  const entries = snapshot.log.filter((entry) => entry.projectId === view.id);

  return (
    <div className="pb-6">
      <Link className="enter group mb-6 inline-flex items-center gap-1.5 text-[.8125rem] text-muted-foreground hover:text-foreground" href={base} prefetch={false}>
        <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-0.5" /><span className="link-grow">工作台</span>
      </Link>

      <header className="flex flex-col gap-5 pb-8 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between">
        <div className="min-w-0">
          <Kicker>发布台 · Release desk</Kicker>
          <h1 className="mt-3 text-[clamp(2rem,4.2vw,3.5rem)] font-medium leading-[1.05] tracking-[-.04em]"><span className="title-line"><span>{view.name}</span></span></h1>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[.75rem]">
            <span className="font-code text-muted-foreground">/{view.slug}</span>
            <ToneBadge tone={visibilityLabels[view.visibility].tone}>{visibilityLabels[view.visibility].label}</ToneBadge>
            <ToneBadge tone="warning">示例项目 · Mock</ToneBadge>
          </p>
        </div>
        <div className="flex flex-col gap-2 min-[521px]:flex-row">
          <Button asChild variant="outline"><Link href={`${projectsBase}/${view.slug}`} prefetch={false}>项目控制台<ArrowUpRight className="size-4" /></Link></Button>
        </div>
      </header>

      <nav aria-label="切换项目" className="scroll-x mb-6 flex gap-1.5">
        {snapshot.summaries.map((summary) => (
          <Link
            aria-current={summary.slug === slug ? "page" : undefined}
            className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[.75rem] font-medium transition-colors duration-300", summary.slug === slug ? "bg-foreground text-background" : "bg-surface text-muted-foreground hover:text-foreground")}
            href={`${base}/projects/${summary.slug}`}
            key={summary.slug}
            prefetch={false}
          >
            {summary.name}
          </Link>
        ))}
      </nav>

      <Pipeline view={view} />

      <div className="mt-0.5 grid gap-0.5 min-[1180px]:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-0.5">
          <ResultBanner last={last} />
          <DraftPanel api={api} key={`${view.draft.head.id}`} ownEtags={ownEtags} />
          <ReviewPanel api={api} />
          <VersionsPanel api={api} key={`versions-${view.versions.length}`} />
          <ReleasesPanel api={api} />
        </div>

        <aside aria-label="身份、工具与协议日志" className="space-y-0.5 min-[1180px]:sticky min-[1180px]:top-[calc(var(--shell-header-height,4rem)+1rem)] min-[1180px]:max-h-[calc(100dvh-var(--shell-header-height,4rem)-2rem)] min-[1180px]:self-start min-[1180px]:overflow-y-auto">
          <section aria-labelledby="desk-identity" className="rounded-card bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium" id="desk-identity"><Users aria-hidden="true" className="size-4" />当前身份</h2>
            <p className="mt-3 text-[1.0625rem] font-medium">{persona.name}</p>
            <p className="mt-0.5 text-[.75rem] text-muted-foreground">{persona.note}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.length ? roles.map((role) => <ToneBadge key={role} tone={role === "OWNER" ? "ink" : "neutral"}>{roleLabels[role]}</ToneBadge>) : <ToneBadge tone="neutral">不是项目成员</ToneBadge>}
              <ToneBadge dot tone={qualified ? "success" : "danger"}>{qualified ? "操作资格有效" : "操作资格已撤销"}</ToneBadge>
            </div>
            <ul className="mt-4 space-y-1 border-t border-border/12 pt-3 text-[.75rem]">
              {view.members.filter((member) => member.personaId !== snapshot.personaId).map((member) => (
                <li className="flex flex-wrap items-center justify-between gap-2" key={member.personaId}>
                  <span>{personaName(member.personaId)} <span className="text-muted-foreground">· {member.roles.map((role) => roleLabels[role]).join(" / ")}</span></span>
                  {tools ? <button className="link-grow text-[.6875rem] font-medium" onClick={() => tools.setPersona(member.personaId)} type="button">切换</button> : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[.6875rem] leading-4 text-muted-foreground">切换身份只存在于 Mock。接入真实 Registry 后，这里就是你登录的账户，独立审核需要另一个人登录。</p>
          </section>

          {tools ? (
            <section aria-labelledby="desk-tools" className="rounded-card bg-surface p-5">
              <h2 className="text-sm font-medium" id="desk-tools">模拟环境</h2>
              <p className="mt-1 text-[.6875rem] leading-4 text-muted-foreground">制造真实环境里会遇到的情况，观察协议如何拒绝。</p>
              <ul className="mt-3 space-y-2.5 text-[.75rem]">
                <li>
                  <Button disabled={!canSimulateEdit} onClick={() => void tools.simulateConcurrentEdit(view.id)} size="sm" variant="outline"><Users className="size-3.5" />协作者并发保存</Button>
                  <p className="mt-1 text-[.6875rem] text-muted-foreground">{canSimulateEdit ? `${personaName(peer!.personaId)}在别处保存草稿，你手里的 ETag 随之过期。` : "需要可编辑的草稿和另一位编辑成员。"}</p>
                </li>
                <li>
                  <Button onClick={() => tools.advanceClock(16 * 60 * 1000)} size="sm" variant="outline"><Clock3 className="size-3.5" />时钟快进 16 分钟</Button>
                  <p className="mt-1 text-[.6875rem] text-muted-foreground">审核与发布申请的 15 分钟期限会过期。</p>
                </li>
                <li>
                  <Button onClick={() => tools.toggleQualification(snapshot.personaId)} size="sm" variant="outline">{qualified ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}{qualified ? "撤销" : "恢复"}{persona.name}的操作资格</Button>
                  <p className="mt-1 text-[.6875rem] text-muted-foreground">资格变化立即生效，并推进相关项目的授权 epoch；恢复后旧审核也不会复活。</p>
                </li>
                <li>
                  <Button onClick={() => { tools.reset(); setLast(null); ownEtags.current.clear(); }} size="sm" variant="ghost"><RotateCcw className="size-3.5" />重置示例数据</Button>
                </li>
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="desk-log" className="rounded-card bg-surface p-5">
            <h2 className="flex items-center justify-between gap-2 text-sm font-medium" id="desk-log">协议日志<span className="font-code text-[.6875rem] font-normal text-muted-foreground">{entries.length}</span></h2>
            <div className="mt-3"><ProtocolLog busy={snapshot.pending !== null} entries={entries} onReplay={(seq) => void replay(seq)} personaName={personaName} /></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
