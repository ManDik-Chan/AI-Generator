"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowLeft, Download, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { Kicker, ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form-field";
import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { Facts, Mono, Panel } from "@/features/developer-console/components/desk-kit";
import { ErrorNote } from "@/features/developer-console/components/registry-kit";
import { useDraftEditor, useNow } from "@/features/developer-console/components/registry-provider";
import { draftStateMeta, formatClock, visibilityLabels } from "@/features/developer-console/labels";
import { CLAIM_STATUSES, MANIFEST_CAPABILITIES, MANIFEST_CATEGORIES, MANIFEST_VISIBILITIES } from "@/features/platform/manifest";
import { categoryLabels } from "@/features/platform/labels";
import { payloadViewSchema, type PayloadView } from "@/features/developer-console/registry/contract";
import type { DraftConflict, EditorSnapshot, ServerDraft } from "@/features/developer-console/registry/draft-editor";
import { payloadIssues, stableStringify } from "@/features/developer-console/registry/write-contract";
import { editAccess, editAccessText, unknownText, writeErrorText, writeStatusText, type EditAccess } from "@/features/developer-console/registry/write-view";
import { cn } from "@/lib/utils";

export interface EditorActions {
  onEdit: (next: PayloadView) => void;
  onSave: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  onVerify: () => void;
  onAbandon: () => void;
  onReload: () => void;
  onResolve: (choice: "keep-mine" | "take-remote") => void;
}

export function DraftEditorDesk({ projectId, base }: { projectId: string; base: string }) {
  const { snapshot, store } = useDraftEditor(projectId);
  const now = useNow();
  const dirtyOrPending = snapshot.dirty || snapshot.pending !== null;
  useEffect(() => {
    if (!dirtyOrPending) return;
    // Unsaved edits live only in this page's memory; ask before the page is unloaded.
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyOrPending]);
  return (
    <DraftEditorView
      actions={{
        onEdit: (next) => store.edit(next),
        onSave: () => void store.save(),
        onDiscard: () => store.discard(),
        onRetry: () => void store.retry(),
        onVerify: () => void store.verify(),
        onAbandon: () => store.abandon(),
        onReload: () => void store.load(),
        onResolve: (choice) => store.resolveConflict(choice),
      }}
      base={base}
      now={now}
      snapshot={snapshot}
    />
  );
}

const clone = (payload: PayloadView): PayloadView => JSON.parse(JSON.stringify(payload)) as PayloadView;
const note = "rounded-control px-4 py-3 text-[.8125rem]";

function exportDraft(payload: PayloadView, slug: string) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `registry-draft-${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DraftEditorView({ snapshot, base, now, actions }: { snapshot: EditorSnapshot; base: string; now: number; actions: EditorActions }) {
  const { project, working, pending, conflict, lock } = snapshot;
  const slug = project?.slug ?? snapshot.base?.payload?.manifest.slug ?? null;
  const access = editAccess(project, snapshot.projectError, snapshot.base?.state ?? null, now);
  const editable = access.kind === "editable" && !lock;
  const issues = working && slug ? payloadIssues(working, { projectId: snapshot.projectId, slug }) : [];
  const busy = pending?.phase === "sending" || pending?.phase === "verifying";
  const paused = snapshot.blockedUntil !== null && snapshot.blockedUntil > now;
  const canSave = editable && snapshot.dirty && !pending && !conflict && issues.length === 0 && !paused && snapshot.base !== null;
  const projectHref = `${base}/projects/${snapshot.projectId}`;

  return (
    <div className="pb-6">
      <Link className="enter group mb-6 inline-flex items-center gap-1.5 text-[.8125rem] text-muted-foreground hover:text-foreground" href={projectHref} prefetch={false}>
        <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-0.5" /><span className="link-grow">返回项目</span>
      </Link>

      <header className="flex flex-col gap-5 pb-6 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between">
        <div className="min-w-0">
          <Kicker>Registry · 编辑草稿</Kicker>
          <h1 className="mt-3 break-all text-[clamp(2rem,4.2vw,3.5rem)] font-medium leading-[1.05] tracking-[-.04em]">{slug ? `/${slug}` : "草稿"}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[.75rem]">
            <Mono className="text-muted-foreground">{snapshot.projectId}</Mono>
            {snapshot.base ? <ToneBadge tone={draftStateMeta[snapshot.base.state].tone}>{draftStateMeta[snapshot.base.state].label}</ToneBadge> : null}
            <ToneBadge dot tone="success">Registry · 真实写入</ToneBadge>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={snapshot.loading || busy} loading={snapshot.loading} onClick={actions.onReload} variant="outline">{snapshot.loading ? null : <RotateCcw className="size-4" />}重新读取</Button>
          {working && slug ? <Button onClick={() => exportDraft(working, slug)} variant="outline"><Download className="size-4" />导出草稿 JSON</Button> : null}
        </div>
      </header>

      <SaveStatus actions={actions} canSave={canSave} editable={editable} issues={issues} paused={paused} snapshot={snapshot} />

      {snapshot.loadError && !snapshot.base ? <ErrorNote className="mt-4" error={snapshot.loadError} scope="draft" /> : null}
      {snapshot.loadError && snapshot.base ? <ErrorNote className="mt-4" error={snapshot.loadError} scope="draft" stale={snapshot.base.confirmedAt} /> : null}
      {access.kind !== "editable" && (snapshot.base || snapshot.projectError) ? <AccessNote access={access} hasWork={snapshot.dirty} /> : null}
      {conflict ? <ConflictBlock actions={actions} conflict={conflict} editable={editable} working={working} /> : null}

      {working ? (
        <div className="mt-6 grid gap-0.5 min-[1180px]:grid-cols-[minmax(0,1fr)_21rem]">
          <EditorBody disabled={!editable || busy} issues={issues} onEdit={actions.onEdit} working={working} />
          <aside aria-label="保存依据" className="space-y-0.5 min-[1180px]:sticky min-[1180px]:top-[calc(var(--shell-header-height,4rem)+1rem)] min-[1180px]:self-start">
            <BasisPanel snapshot={snapshot} />
          </aside>
        </div>
      ) : !snapshot.loadError && !snapshot.projectError ? (
        <p aria-busy="true" className="mt-6 text-[.8125rem] text-muted-foreground">正在读取…</p>
      ) : null}
    </div>
  );
}

function SaveStatus({ snapshot, actions, canSave, editable, issues, paused }: { snapshot: EditorSnapshot; actions: EditorActions; canSave: boolean; editable: boolean; issues: string[]; paused: boolean }) {
  const { pending, last, lock, base, dirty } = snapshot;
  let line: ReactNode;
  if (pending?.phase === "sending") line = <span>正在保存… 请求已发送 {pending.sends} 次</span>;
  else if (pending?.phase === "verifying") line = <span>正在核验结果…</span>;
  else if (pending) line = <span className="text-warning-foreground">保存结果未知，尚未确认</span>;
  else if (dirty) line = <span><b className="font-medium">有未保存的修改</b>{base ? <> · 基于服务端 rev {base.revision}</> : null}</span>;
  else if (base?.payload) line = <span>与服务端一致 · rev {base.revision} · {base.via === "save" ? "保存" : base.via === "verify" ? "核验" : "读取"}确认于 {formatClock(base.confirmedAt)}</span>;
  else if (base) line = <span>草稿尚未初始化：第一次保存后才有内容</span>;
  else line = <span className="text-muted-foreground">尚未读取</span>;

  return (
    <section aria-label="保存状态" className="sticky top-[calc(var(--shell-header-height,4rem)+.5rem)] z-10 rounded-card bg-surface/95 p-4 backdrop-blur">
      <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
        <p aria-live="polite" className="flex flex-wrap items-center gap-2 text-[.8125rem]">
          <span aria-hidden="true" className={cn("size-2 rounded-full", pending ? "bg-warning" : dirty ? "bg-[hsl(var(--primary))]" : "bg-success")} />
          {line}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && !pending ? <Button disabled={!editable} onClick={actions.onDiscard} size="sm" variant="ghost">放弃修改</Button> : null}
          <Button disabled={!canSave} loading={pending?.phase === "sending"} onClick={actions.onSave} size="sm">{pending?.phase === "sending" ? null : <Save className="size-4" />}保存草稿</Button>
        </div>
      </div>
      {dirty && issues.length && editable ? <p className="mt-2 text-[.75rem] text-destructive-foreground">还有 {issues.length} 处内容不符合要求，修正后才能保存。</p> : null}
      {paused ? <p className="mt-2 font-code text-[.6875rem] text-warning-foreground">写入已暂停（429），{formatClock(snapshot.blockedUntil!)} 后恢复</p> : null}
      {pending && pending.phase !== "sending" ? <UnknownBlock actions={actions} paused={paused} snapshot={snapshot} /> : null}
      {lock ? (
        <div className={cn(note, "mt-3 bg-destructive-subtle text-destructive-foreground")} role="alert">
          <p className="font-medium"><span className="font-code">{writeStatusText(lock)}</span> · {writeErrorText(lock, "draft").title}</p>
          <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">{writeErrorText(lock, "draft").detail}</p>
          {lock.code === "AUTH_REQUIRED" ? (
            <p className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><a href="/login" rel="noopener" target="_blank">在新标签页登录</a></Button>
              <Button onClick={actions.onReload} size="sm" variant="outline">登录后重新读取</Button>
            </p>
          ) : <p className="mt-2"><Button onClick={actions.onReload} size="sm" variant="outline">重新读取资格与草稿</Button></p>}
        </div>
      ) : last?.kind === "rejected" && !snapshot.conflict ? (
        <div className={cn(note, "mt-3 bg-warning-subtle text-warning-foreground")} role="alert">
          <p className="font-medium"><span className="font-code">{writeStatusText(last.error)}</span> · {writeErrorText(last.error, "draft").title}</p>
          <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">{writeErrorText(last.error, "draft").detail}</p>
        </div>
      ) : last?.kind === "saved" && !dirty && !pending ? (
        <p className="mt-2 text-[.75rem] text-success-foreground" role="status">
          已由服务端确认保存为 rev {last.revision}（{formatClock(last.at)}）{last.replayed ? " · 这是先前同一请求的重放结果" : ""}{last.verified ? "" : " · 正在确认是否为最新版本"}
        </p>
      ) : null}
      <p className="mt-2 text-[.6875rem] leading-4 text-muted-foreground">未保存的修改只在本页内存中：在控制台内切换页面不会丢失；刷新、关闭标签页、退出登录或浏览器崩溃会丢失，需要时请先导出。</p>
    </section>
  );
}

function UnknownBlock({ snapshot, actions, paused }: { snapshot: EditorSnapshot; actions: EditorActions; paused: boolean }) {
  const pending = snapshot.pending!;
  const verifying = pending.phase === "verifying";
  return (
    <div className={cn(note, "mt-3 bg-warning-subtle text-warning-foreground")} role="alert">
      <p className="font-medium">结果未知：草稿可能已经保存，也可能没有</p>
      <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">
        {pending.reason ? unknownText(pending.reason) : null}{" "}
        {verifying ? "正在重新读取草稿以核验…" : pending.verification === "unchanged"
          ? "核验读取：服务端草稿仍是这次请求所基于的版本，请求可能没有生效，也可能仍在处理。"
          : pending.verification === "unreadable" ? "核验读取也失败了，暂时无法确认。" : null}
        {" "}用同一请求重试是安全的：如果先前已经保存，服务端会返回同一结果，不会重复写入。已发送 {pending.sends} 次。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={verifying || paused} onClick={actions.onRetry} size="sm">用同一请求重试</Button>
        <Button disabled={verifying} onClick={actions.onVerify} size="sm" variant="outline">重新核验</Button>
        <Button disabled={verifying} onClick={actions.onAbandon} size="sm" variant="ghost">放弃这个请求</Button>
      </div>
      <p className="mt-2 text-[.6875rem] opacity-80">放弃后你的修改仍在本页；下次保存会作为新请求发送，如果先前那次其实已生效，服务端会返回版本冲突，由你决定如何处理。</p>
    </div>
  );
}

function AccessNote({ access, hasWork }: { access: Exclude<EditAccess, { kind: "editable" }>; hasWork: boolean }) {
  const text = editAccessText(access);
  return (
    <div className={cn(note, "mt-4 border border-dashed border-foreground/18")} role="status">
      <p className="font-medium">{text.title} · 只读查看</p>
      <p className="mt-0.5 text-[.75rem] leading-5 text-muted-foreground">{text.detail}{hasWork ? " 你未保存的修改仍保留在下方，可以导出。" : ""}</p>
      {access.kind === "unknown" && access.error ? <p className="mt-1 font-code text-[.6875rem] text-muted-foreground">{access.error.status ? `${access.error.status} ` : "未发送 · "}{access.error.code}</p> : null}
    </div>
  );
}

const compareKeys: [string, (payload: PayloadView) => unknown][] = [
  ["名称", (p) => p.manifest.name], ["简介", (p) => p.manifest.summary], ["版本", (p) => p.manifest.version],
  ["类别", (p) => p.manifest.category], ["目标可见性", (p) => p.manifest.visibility], ["能力", (p) => p.manifest.capabilities],
  ["研究声明", (p) => p.manifest.researchClaims], ["展示标题", (p) => p.presentation.title], ["展示章节", (p) => p.presentation.sections],
  ["文档", (p) => p.documentation],
];

function ConflictBlock({ conflict, working, editable, actions }: { conflict: DraftConflict; working: PayloadView | null; editable: boolean; actions: EditorActions }) {
  const remote: ServerDraft | null = conflict.remote;
  const differences = remote && working ? compareKeys.filter(([, pick]) => stableStringify(pick(working)) !== stableStringify(remote.payload ? pick(remote.payload) : undefined)) : [];
  const cause = conflict.cause === "precondition" ? "保存被拒绝（412）：你基于的版本已不是最新。" : conflict.cause === "after-unknown"
    ? "核验时发现服务端草稿已变为其他内容：先前那次保存被覆盖，或没有生效。" : "重新读取时发现服务端草稿已被修改，而你有未保存的修改。";
  return (
    <section aria-labelledby="draft-conflict" className={cn(note, "mt-4 bg-warning-subtle text-warning-foreground")} role="alert">
      <h2 className="font-medium" id="draft-conflict">版本冲突 · 没有覆盖任何内容</h2>
      <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">{cause}</p>
      {remote ? (
        <>
          <p className="mt-2 text-[.75rem]">服务端当前：rev {remote.revision} · {draftStateMeta[remote.state].label} · <span className="font-code">{remote.etag}</span></p>
          {differences.length ? (
            <ul className="mt-2 grid gap-1 text-[.75rem]">
              {differences.map(([label, pick]) => (
                <li className="grid gap-x-3 min-[640px]:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]" key={label}>
                  <span className="font-medium">{label}</span>
                  <span className="min-w-0 truncate" title={summarize(working ? pick(working) : undefined)}>我的：{summarize(working ? pick(working) : undefined)}</span>
                  <span className="min-w-0 truncate" title={summarize(remote.payload ? pick(remote.payload) : undefined)}>服务端：{summarize(remote.payload ? pick(remote.payload) : undefined)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!editable} onClick={() => actions.onResolve("keep-mine")} size="sm">保留我的修改，基于服务端版本继续</Button>
            <Button onClick={() => { if (window.confirm("放弃你的修改并采用服务端版本？未导出的修改将无法找回。")) actions.onResolve("take-remote"); }} size="sm" variant="outline">采用服务端版本</Button>
          </div>
          <p className="mt-2 text-[.6875rem] opacity-80">选择「保留我的修改」后，下一次保存会以服务端当前版本为基线发送，并覆盖服务端上的这些差异；保存前仍可继续修改或先导出。</p>
        </>
      ) : (
        <div className="mt-2 text-[.75rem]">
          <p>无法读取服务端的当前版本{conflict.readError ? `（${conflict.readError.status ? `${conflict.readError.status} ` : ""}${conflict.readError.code}）` : ""}。你的修改仍在本页。</p>
          <p className="mt-2"><Button onClick={actions.onReload} size="sm" variant="outline">重新读取</Button></p>
        </div>
      )}
    </section>
  );
}

function summarize(value: unknown): string {
  if (value === undefined) return "（无）";
  if (typeof value === "string") return value || "（空）";
  if (Array.isArray(value)) return value.every((item) => typeof item === "string") ? value.join("、") || "（空）" : `${value.length} 项`;
  return JSON.stringify(value);
}

function BasisPanel({ snapshot }: { snapshot: EditorSnapshot }) {
  const { base, pending } = snapshot;
  return (
    <section aria-labelledby="draft-basis" className="rounded-card bg-surface p-5">
      <h2 className="text-sm font-medium" id="draft-basis">保存依据</h2>
      <p className="mt-1 text-[.6875rem] leading-4 text-muted-foreground">每次保存发送完整草稿、一个新的幂等键，以及服务端确认的 ETag 作为 If-Match。只有结果未知时，才会用同一个键和同一份内容重试。</p>
      {base ? (
        <Facts
          className="mt-3"
          items={[
            ["服务端版本", <span key="r">rev {base.revision} · {draftStateMeta[base.state].label}</span>],
            ["If-Match", <Mono key="e">{base.etag}</Mono>],
            ["内容哈希", base.contentHash ? <Mono key="h">{base.contentHash.slice(0, 16)}…</Mono> : <span className="text-muted-foreground" key="h">{base.payload ? "保存响应不含哈希；重新读取后显示" : "未初始化"}</span>],
            ["确认方式", `${base.via === "save" ? "保存响应" : base.via === "verify" ? "核验读取" : "读取"} · ${formatClock(base.confirmedAt)}`],
          ]}
        />
      ) : null}
      {pending ? (
        <Facts
          className="mt-3"
          items={[
            ["未决请求", <Mono key="k">{pending.attempt.key}</Mono>],
            ["基于", <Mono key="m">{pending.attempt.ifMatch}</Mono>],
          ]}
        />
      ) : null}
    </section>
  );
}

function EditorBody({ working, disabled, issues, onEdit }: { working: PayloadView; disabled: boolean; issues: string[]; onEdit: (next: PayloadView) => void }) {
  const [mode, setMode] = useState<"form" | "json">("form");
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4">
        <SegmentedControl label="编辑方式">
          <Segment active={mode === "form"} onClick={() => setMode("form")}>表单</Segment>
          <Segment active={mode === "json"} onClick={() => setMode("json")}>完整 JSON</Segment>
        </SegmentedControl>
        <span className="text-[.75rem] text-muted-foreground">两种方式编辑的是同一份草稿；保存时总是发送完整内容。</span>
      </div>
      {issues.length ? (
        <div className={cn(note, "bg-destructive-subtle text-destructive-foreground")} role="status">
          <p className="font-medium">需要修正（{issues.length}）</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 font-code text-[.6875rem]">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      ) : null}
      {mode === "form" ? <FormEditor disabled={disabled} onEdit={onEdit} working={working} /> : <JsonEditor disabled={disabled} onEdit={onEdit} working={working} />}
    </div>
  );
}

function FormEditor({ working, disabled, onEdit }: { working: PayloadView; disabled: boolean; onEdit: (next: PayloadView) => void }) {
  const id = useId();
  const change = (mutate: (draft: PayloadView) => void) => {
    const next = clone(working);
    mutate(next);
    onEdit(next);
  };
  const { manifest, presentation } = working;
  const markdownCount = presentation.sections.filter((section) => section.kind === "MARKDOWN").length;

  return (
    <fieldset className="min-w-0 space-y-0.5 disabled:opacity-90" disabled={disabled}>
      <Panel id="draft-manifest" meta={<ToneBadge tone="neutral">manifest</ToneBadge>} title="项目信息">
        <div className="grid gap-4 min-[760px]:grid-cols-2">
          <Field count={`${manifest.name.length}/500`} htmlFor={`${id}-name`} label="名称" required>
            <Input id={`${id}-name`} maxLength={500} onChange={(e) => change((d) => { d.manifest.name = e.target.value; })} value={manifest.name} />
          </Field>
          <Field help="主版本.次版本.修订号，例如 1.0.0；展示内容的版本随之同步。" htmlFor={`${id}-version`} label="版本" required>
            <Input className="font-code" id={`${id}-version`} maxLength={100} onChange={(e) => change((d) => { d.manifest.version = e.target.value.trim(); d.presentation.version = e.target.value.trim(); })} value={manifest.version} />
          </Field>
          <Field className="min-[760px]:col-span-2" count={`${manifest.summary.length}/500`} htmlFor={`${id}-summary`} label="简介" required>
            <Textarea id={`${id}-summary`} maxLength={500} onChange={(e) => change((d) => { d.manifest.summary = e.target.value; })} value={manifest.summary} />
          </Field>
          <Field htmlFor={`${id}-category`} label="类别">
            <Select id={`${id}-category`} onChange={(e) => change((d) => { d.manifest.category = e.target.value as PayloadView["manifest"]["category"]; })} value={manifest.category}>
              {MANIFEST_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabels[category]}（{category}）</option>)}
            </Select>
          </Field>
          <Field help="发布时采用的可见性；保存草稿不会公开任何内容。" htmlFor={`${id}-visibility`} label="目标可见性">
            <Select id={`${id}-visibility`} onChange={(e) => change((d) => { d.manifest.visibility = e.target.value as PayloadView["manifest"]["visibility"]; })} value={manifest.visibility}>
              {MANIFEST_VISIBILITIES.map((visibility) => <option key={visibility} value={visibility}>{visibilityLabels[visibility].label}</option>)}
            </Select>
          </Field>
        </div>
        <fieldset className="mt-5">
          <legend className="text-label">能力（至少一项）</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {MANIFEST_CAPABILITIES.map((capability) => (
              <label className="inline-flex items-center gap-2 text-[.8125rem]" key={capability}>
                <input
                  checked={manifest.capabilities.includes(capability)}
                  className="size-4 accent-[hsl(var(--foreground))]"
                  onChange={(e) => change((d) => {
                    d.manifest.capabilities = e.target.checked ? MANIFEST_CAPABILITIES.filter((item) => item === capability || d.manifest.capabilities.includes(item)) : d.manifest.capabilities.filter((item) => item !== capability);
                  })}
                  type="checkbox"
                />
                <span className="font-code text-[.75rem]">{capability}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-4 text-[.75rem] text-muted-foreground">研究声明 {manifest.researchClaims.length} 条（状态：{CLAIM_STATUSES.join(" / ")}）与文档 {working.documentation.length} 份在「完整 JSON」中编辑；它们引用的资产必须属于本项目，由服务端校验。</p>
      </Panel>

      <Panel id="draft-presentation" meta={<ToneBadge tone="neutral">presentation</ToneBadge>} title="展示内容">
        <Field count={`${presentation.title.length}/500`} htmlFor={`${id}-title`} label="展示标题" required>
          <Input id={`${id}-title`} maxLength={500} onChange={(e) => change((d) => { d.presentation.title = e.target.value; })} value={presentation.title} />
        </Field>
        <div className="mt-5 space-y-4">
          {presentation.sections.map((section, index) => (
            <div className="rounded-control border border-border/14 p-4" key={`${index}-${section.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[.8125rem] font-medium">章节 {index + 1}<ToneBadge tone="neutral">{section.kind}</ToneBadge></p>
                <Button aria-label={`删除章节 ${index + 1}`} onClick={() => change((d) => { d.presentation.sections.splice(index, 1); })} size="icon-sm" variant="ghost"><Trash2 className="size-4" /></Button>
              </div>
              {section.kind === "MARKDOWN" ? (
                <div className="mt-3 grid gap-3 min-[760px]:grid-cols-[12rem_minmax(0,1fr)]">
                  <Field help="小写字母开头" htmlFor={`${id}-s${index}-id`} label="章节 ID">
                    <Input className="font-code" id={`${id}-s${index}-id`} maxLength={64} onChange={(e) => change((d) => { d.presentation.sections[index].id = e.target.value.trim(); })} value={section.id} />
                  </Field>
                  <Field htmlFor={`${id}-s${index}-title`} label="章节标题">
                    <Input id={`${id}-s${index}-title`} maxLength={500} onChange={(e) => change((d) => { d.presentation.sections[index].title = e.target.value; })} value={section.title} />
                  </Field>
                  <Field className="min-[760px]:col-span-2" count={`${section.body.length}/20000`} htmlFor={`${id}-s${index}-body`} label="正文（Markdown）">
                    <Textarea className="min-h-40 font-code text-[.8125rem]" id={`${id}-s${index}-body`} maxLength={20_000} onChange={(e) => change((d) => { const target = d.presentation.sections[index]; if (target.kind === "MARKDOWN") target.body = e.target.value; })} value={section.body} />
                  </Field>
                </div>
              ) : (
                <p className="mt-2 text-[.75rem] text-muted-foreground"><Mono>{section.id}</Mono> · {section.title} — 这类章节引用资产，在「完整 JSON」中编辑。</p>
              )}
            </div>
          ))}
          <Button
            disabled={presentation.sections.length >= 24}
            onClick={() => change((d) => {
              const taken = new Set(d.presentation.sections.map((section) => section.id));
              let n = markdownCount + 1;
              while (taken.has(`section-${n}`)) n += 1;
              d.presentation.sections.push({ id: `section-${n}`, kind: "MARKDOWN", title: "新章节", body: "", sourceAssetIds: [] });
            })}
            size="sm"
            variant="outline"
          >
            <Plus className="size-4" />添加文字章节
          </Button>
        </div>
      </Panel>
    </fieldset>
  );
}

function JsonEditor({ working, disabled, onEdit }: { working: PayloadView; disabled: boolean; onEdit: (next: PayloadView) => void }) {
  const id = useId();
  const pretty = JSON.stringify(working, null, 2);
  const [text, setText] = useState(pretty);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(pretty);
  // Follow outside changes (form edits, conflict resolution) while the text is not being edited.
  if (pretty !== source && text === source) {
    setSource(pretty);
    setText(pretty);
  }
  const edited = text !== pretty;
  return (
    <Panel id="draft-json" meta={<ToneBadge tone="neutral">DraftPayload</ToneBadge>} title="完整 JSON">
      <Field error={error ?? undefined} help="manifest、presentation 与 documentation 三部分；未知字段会被拒绝。应用后才会进入草稿。" htmlFor={`${id}-json`} label="草稿内容">
        <Textarea
          aria-invalid={error ? true : undefined}
          className="min-h-[28rem] font-code text-[.75rem] leading-5"
          disabled={disabled}
          id={`${id}-json`}
          onChange={(event) => { setText(event.target.value); setError(null); }}
          spellCheck={false}
          value={text}
        />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={disabled || !edited}
          onClick={() => {
            let parsed: unknown;
            try { parsed = JSON.parse(text); } catch { setError("不是合法的 JSON。"); return; }
            const result = payloadViewSchema.safeParse(parsed);
            if (!result.success) { setError(`结构不符合 DraftPayload：${result.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；")}`); return; }
            setError(null);
            setSource(JSON.stringify(result.data, null, 2));
            setText(JSON.stringify(result.data, null, 2));
            onEdit(result.data);
          }}
          size="sm"
        >
          应用到草稿
        </Button>
        <Button disabled={!edited} onClick={() => { setText(pretty); setSource(pretty); setError(null); }} size="sm" variant="ghost">撤销未应用的修改</Button>
      </div>
    </Panel>
  );
}
