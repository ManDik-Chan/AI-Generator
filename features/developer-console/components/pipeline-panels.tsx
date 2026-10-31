"use client";

import { useId, useState } from "react";

import { ToneBadge } from "@/components/platform/primitives";
import { shortHash } from "@/features/developer-console/content-hash";
import { Countdown } from "@/features/developer-console/components/console-provider";
import { ActionButton, ActionGroup, ContractBadge, Facts, Mono, Panel, type DeskApi } from "@/features/developer-console/components/desk-kit";
import { bumpMinor, formatClock, releaseStateMeta, requestStateMeta, reviewStateMeta, visibilityLabels } from "@/features/developer-console/labels";
import type { ReleaseRecordDTO, VersionDTO } from "@/features/developer-console/model";

/* ---------------- Review ---------------- */

export function ReviewPanel({ api }: { api: DeskApi }) {
  const { view } = api;
  const decisionOrigin = useId();
  const approvedOrigin = useId();
  const [latest, ...older] = view.reviews;
  const inReview = view.draft.head.state === "IN_REVIEW";

  if (!latest) {
    return (
      <Panel id="review" meta={<ContractBadge status="merged" />} title="审核">
        <p className="text-[.8125rem] leading-6 text-muted-foreground">这份草稿还没有提交过审核。提交后，服务端冻结内容哈希、资产摘要、授权 epoch 与 15 分钟期限，再由另一位具有审核角色的成员决定。</p>
      </Panel>
    );
  }

  const selfReview = { blocked: latest.submittedByViewer, reason: "提交人不能审核自己的提交", role: "REVIEWER" as const };
  const decide = (decision: "APPROVED" | "REJECTED") => api.send({ action: "DECIDE_REVIEW", ifMatch: view.draft.etag, input: { reviewId: latest.id, decision, expectedContentHash: latest.contentHash } });
  const withdraw = () => api.send({ action: "WITHDRAW_REVIEW", ifMatch: view.draft.etag, input: { reviewId: latest.id } });
  const seal = () => api.send({ action: "SEAL_VERSION", ifMatch: view.draft.etag, input: { reviewId: latest.id, expectedContentHash: latest.contentHash } });
  const state = reviewStateMeta[latest.effectiveState];
  const sealGate = api.gate("SEAL_VERSION");
  const withdrawGate = api.gate("WITHDRAW_REVIEW");
  // After approval, seal and withdraw usually fail for the same reason; explain it once.
  const sharedApprovedDenial = latest.effectiveState === "APPROVED" && inReview && !sealGate.allowed && !withdrawGate.allowed && sealGate.reason === withdrawGate.reason;
  const live =inReview && (latest.effectiveState === "PENDING" || latest.effectiveState === "APPROVED");
  const version = view.draft.dto?.payload.manifest.version;

  return (
    <Panel id="review" meta={<><ToneBadge tone={state.tone}>{state.label}</ToneBadge><ContractBadge status="merged" /></>} title="审核">
      <Facts
        items={[
          ["Review", <Mono key="r">{latest.id}</Mono>],
          ["绑定", <span key="b"><Mono>rev {latest.draftRevision}</Mono> · <Mono>{shortHash(latest.contentHash, 16)}</Mono></span>],
          ["提交人", latest.submittedByViewer ? "当前身份" : "其他成员"],
          ["历史决定", <span key="d"><Mono>{latest.decision}</Mono>{latest.decision !== latest.effectiveState ? <span className="text-muted-foreground"> · 当前有效性 <Mono>{latest.effectiveState}</Mono></span> : null}</span>],
          ["期限", live ? <Countdown className="font-code text-[.75rem] tabular-nums" deadline={latest.expiresAt} key="c" /> : <span key="x" className="text-muted-foreground">{formatClock(latest.expiresAt)}</span>],
        ]}
      />
      {latest.effectiveState === "INVALIDATED" && inReview ? (
        <p className="mt-4 text-[.75rem] leading-5 text-muted-foreground">这次审核已经失效（过期、授权 epoch 变化或参与者资格变化）。撤回审核回到草稿，再重新提交。</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-start gap-3 border-t border-border/12 pt-5">
        {latest.effectiveState === "PENDING" ? (
          <>
            <ActionGroup api={api} gate={api.gate("DECIDE_REVIEW", selfReview)} onRunAnyway={() => decide("APPROVED")} origin={decisionOrigin}>
              <ActionButton action="DECIDE_REVIEW" api={api} gate={api.gate("DECIDE_REVIEW", selfReview)} hint={false} onRun={() => decide("APPROVED")} origin={decisionOrigin}>批准</ActionButton>
              <ActionButton action="DECIDE_REVIEW" api={api} gate={api.gate("DECIDE_REVIEW", selfReview)} hint={false} onRun={() => decide("REJECTED")} origin={decisionOrigin} variant="outline">拒绝</ActionButton>
            </ActionGroup>
          </>
        ) : null}
        {sharedApprovedDenial ? (
          <ActionGroup api={api} gate={sealGate} onRunAnyway={seal} origin={approvedOrigin}>
            <ActionButton action="SEAL_VERSION" api={api} gate={sealGate} hint={false} onRun={seal} origin={approvedOrigin}>封存为 v{version}</ActionButton>
            <ActionButton action="WITHDRAW_REVIEW" api={api} gate={withdrawGate} hint={false} onRun={withdraw} origin={approvedOrigin} variant="outline">撤回审核</ActionButton>
          </ActionGroup>
        ) : null}
        {latest.effectiveState === "APPROVED" && inReview && !sharedApprovedDenial ? (
          <ActionButton action="SEAL_VERSION" api={api} gate={sealGate} onRun={seal}>封存为 v{version}</ActionButton>
        ) : null}
        {inReview && !sharedApprovedDenial ? (
          <ActionButton action="WITHDRAW_REVIEW" api={api} gate={withdrawGate} onRun={withdraw} variant={latest.effectiveState === "PENDING" ? "ghost" : "outline"}>
            {latest.effectiveState === "REJECTED" || latest.effectiveState === "INVALIDATED" ? "撤回审核，回到草稿" : "撤回审核"}
          </ActionButton>
        ) : null}
        {latest.effectiveState === "SEALED" ? <p className="text-[.75rem] text-muted-foreground">已封存为不可变版本。封存是审核历史，不是发布授权：发布需要单独的申请与批准。</p> : null}
      </div>

      {older.length ? (
        <details className="mt-5 text-[.75rem]">
          <summary className="cursor-pointer text-muted-foreground">本草稿更早的审核 · {older.length}</summary>
          <ul className="mt-2 space-y-1">
            {older.map((review) => <li className="flex flex-wrap items-center gap-2" key={review.id}><Mono>{review.id.slice(0, 8)}</Mono><ToneBadge tone={reviewStateMeta[review.effectiveState].tone}>{reviewStateMeta[review.effectiveState].label}</ToneBadge><span className="text-muted-foreground">rev {review.draftRevision}</span></li>)}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}

/* ---------------- Versions ---------------- */

function releasesOf(version: VersionDTO, releases: ReleaseRecordDTO[]) {
  return releases.filter((release) => release.versionId === version.id);
}

export function VersionsPanel({ api }: { api: DeskApi }) {
  const { view } = api;
  const ids = useId();
  const latest = view.versions.at(-1);
  const [nextVersion, setNextVersion] = useState(() => bumpMinor(latest?.version));
  const frozen = view.draft.head.state === "PUBLISHED";
  const openRequest = (versionId: string) => view.releaseRequests.some((request) => request.versionId === versionId && request.state !== "CONSUMED" && Date.parse(request.expiresAt) > api.now);

  const request = (version: VersionDTO, previous?: ReleaseRecordDTO) => api.send({
    action: "REQUEST_RELEASE", ifMatch: view.releaseETag,
    input: previous
      ? { versionId: version.id, expectedContentHash: version.contentHash, intent: "ROLLBACK", targetReleaseId: previous.id }
      : { versionId: version.id, expectedContentHash: version.contentHash, intent: "PUBLISH" },
  });
  const startDraft = () => latest && api.send({ action: "START_DRAFT", ifMatch: view.draft.etag, input: { fromVersionId: latest.id, version: nextVersion } });

  return (
    <Panel id="versions" meta={<ContractBadge status="merged" />} title={`不可变版本 · ${view.versions.length}`}>
      {view.versions.length === 0 ? <p className="text-[.8125rem] text-muted-foreground">还没有封存过版本。草稿经独立审核批准后，才能封存为第一个 Version。</p> : (
        <ul className="border-t border-border/12">
          {view.versions.slice().reverse().map((version) => {
            const history = releasesOf(version, view.releases);
            const current = history.find((release) => release.id === view.currentReleaseId);
            const previous = history.find((release) => release.id !== view.currentReleaseId);
            const visibility = version.snapshot.manifest.visibility;
            return (
              <li className="grid gap-3 border-b border-border/12 py-4 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-start" key={version.id}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-code text-sm font-medium">v{version.version}</span>
                    {current ? <ToneBadge tone="success">当前发布</ToneBadge> : previous ? <ToneBadge tone="neutral">{releaseStateMeta(previous, view.currentReleaseId).label}</ToneBadge> : <ToneBadge tone="neutral">未发布</ToneBadge>}
                    <ToneBadge tone={visibilityLabels[visibility].tone}>目标 · {visibilityLabels[visibility].label}</ToneBadge>
                  </p>
                  <p className="mt-1.5 text-[.75rem] text-muted-foreground"><Mono>{shortHash(version.contentHash, 16)}</Mono> · {version.hashAlgorithm} · 封存于 {formatClock(version.createdAt)}</p>
                </div>
                {!current ? (
                  <ActionButton
                    action="REQUEST_RELEASE"
                    api={api}
                    blockedReason={openRequest(version.id) ? "已有进行中的申请" : undefined}
                    gate={api.gate("REQUEST_RELEASE")}
                    onRun={() => request(version, previous)}
                    variant="outline"
                  >
                    {previous ? "申请回滚到此版本" : "申请发布"}
                  </ActionButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {frozen && latest ? (
        <div className="mt-6 rounded-control border border-dashed border-foreground/18 p-4">
          <p className="flex flex-wrap items-center gap-2 text-[.8125rem] font-medium">开始下一版草稿<ContractBadge status="gap" /></p>
          <p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">当前草稿已冻结。合并的协议里没有“从版本开始新草稿”的命令，这一步只在 Mock 中可用，已列为契约需求。</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[.75rem] text-muted-foreground" htmlFor={`${ids}-next`}>新版本号</label>
              <input className="premium-field mt-1 h-9 w-28 px-3 font-code text-[.8125rem]" id={`${ids}-next`} onChange={(event) => setNextVersion(event.target.value.trim())} value={nextVersion} />
            </div>
            <ActionButton action="START_DRAFT" api={api} gate={api.gate("START_DRAFT")} onRun={startDraft} variant="outline">从 v{latest.version} 复制</ActionButton>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/* ---------------- Releases ---------------- */

export function ReleasesPanel({ api }: { api: DeskApi }) {
  const { view } = api;
  const requests = view.releaseRequests;
  const withdraw = (release: ReleaseRecordDTO) => api.send({ action: "WITHDRAW_RELEASE", ifMatch: view.releaseETag, input: { releaseId: release.id } });

  return (
    <Panel id="releases" meta={<ContractBadge status="merged" />} title="发布">
      <Facts
        className="mb-5"
        items={[
          ["当前指针", view.currentReleaseId ? <Mono key="c">{view.currentReleaseId}</Mono> : <span key="n" className="text-muted-foreground">无（项目不可公开读取）</span>],
          ["发布 ETag", <Mono key="e">{view.releaseETag}</Mono>],
          ["项目", <span key="p"><ToneBadge tone={visibilityLabels[view.visibility].tone}>{visibilityLabels[view.visibility].label}</ToneBadge> <Mono>epoch {view.authzEpoch}</Mono></span>],
        ]}
      />

      {requests.length ? (
        <div className="mb-6 space-y-2">
          <p className="text-[.75rem] font-medium text-muted-foreground">发布申请</p>
          {requests.map((request) => {
            const expired = request.state !== "CONSUMED" && Date.parse(request.expiresAt) <= api.now;
            const approve = () => api.send({ action: "APPROVE_RELEASE", ifMatch: view.releaseETag, input: { requestId: request.id } });
            const executeIt = () => api.send({ action: request.intent === "ROLLBACK" ? "ROLLBACK_RELEASE" : "PUBLISH_RELEASE", ifMatch: view.releaseETag, input: { approvalId: request.approvalId! } });
            const meta = requestStateMeta[request.state];
            return (
              <div className="rounded-control bg-surface-raised p-4" key={request.id}>
                <p className="flex flex-wrap items-center gap-2 text-[.8125rem]">
                  <b className="font-medium">{request.intent === "ROLLBACK" ? "回滚" : "发布"} v{request.version}</b>
                  <ToneBadge tone={expired ? "neutral" : meta.tone}>{expired ? "已过期" : meta.label}</ToneBadge>
                  <ToneBadge tone={visibilityLabels[request.visibility].tone}>{visibilityLabels[request.visibility].label}</ToneBadge>
                  {request.state !== "CONSUMED" && !expired ? <Countdown className="font-code text-[.6875rem] tabular-nums text-muted-foreground" deadline={request.expiresAt} /> : null}
                </p>
                <p className="mt-1 text-[.6875rem] text-muted-foreground">{request.requestedByViewer ? "由当前身份申请" : "由其他成员申请"}{request.approvalId ? ` · 批准 ${request.approvalId.slice(0, 8)}` : ""}</p>
                {request.state !== "CONSUMED" && !expired ? (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    {request.state === "PENDING" ? (
                      <ActionButton action="APPROVE_RELEASE" api={api} gate={api.gate("APPROVE_RELEASE", { blocked: request.requestedByViewer, reason: "批准人不能是申请人", role: "REVIEWER" })} onRun={approve}>批准{request.intent === "ROLLBACK" ? "回滚" : "发布"}</ActionButton>
                    ) : (
                      <ActionButton
                        action={request.intent === "ROLLBACK" ? "ROLLBACK_RELEASE" : "PUBLISH_RELEASE"}
                        api={api}
                        gate={api.gate(request.intent === "ROLLBACK" ? "ROLLBACK_RELEASE" : "PUBLISH_RELEASE", { blocked: !request.requestedByViewer, reason: "必须由原申请人执行", role: "PUBLISHER" })}
                        onRun={executeIt}
                      >
                        {request.intent === "ROLLBACK" ? "执行回滚" : "执行发布"}
                      </ActionButton>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="text-[.75rem] font-medium text-muted-foreground">发布历史 · {view.releases.length}</p>
      {view.releases.length === 0 ? <p className="mt-2 text-[.8125rem] text-muted-foreground">还没有发布过。在版本列表里为一个版本申请发布；私有版本可以发布，但不会产生公开投影。</p> : (
        <ul className="mt-2 border-t border-border/12">
          {view.releases.map((release) => {
            const meta = releaseStateMeta(release, view.currentReleaseId);
            return (
              <li className="grid gap-2 border-b border-border/12 py-3 min-[640px]:grid-cols-[minmax(0,1fr)_auto] min-[640px]:items-center" key={release.id}>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[.8125rem]"><span className="font-code font-medium">v{release.version}</span><ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>{release.intent === "ROLLBACK" ? <ToneBadge tone="info">回滚</ToneBadge> : null}</p>
                  <p className="mt-0.5 text-[.6875rem] text-muted-foreground">发布 {formatClock(release.publishedAt)}{release.withdrawnAt ? ` · 撤回 ${formatClock(release.withdrawnAt)}` : ""} · {visibilityLabels[release.visibilityAtApproval].label}</p>
                </div>
                {release.state === "PUBLISHED" ? (
                  <ActionButton action="WITHDRAW_RELEASE" api={api} gate={api.gate("WITHDRAW_RELEASE")} onRun={() => withdraw(release)} variant="ghost">撤回</ActionButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[.6875rem] leading-5 text-muted-foreground">撤回和回滚都只追加新事实：旧 Release 不会被改写或复活，撤回当前发布会让项目立即回到私有；每次撤回都会推进授权 epoch。规则来自已合并的 P1-B2-B，数据仍是 Mock。</p>
    </Panel>
  );
}
