"use client";

import { useEffect, useId, useMemo, useState, type MutableRefObject } from "react";
import { RotateCcw } from "lucide-react";

import { EmptyBlock, ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { shortHash } from "@/features/developer-console/content-hash";
import { ActionButton, ContractBadge, Facts, Mono, Panel, type DeskApi } from "@/features/developer-console/components/desk-kit";
import { draftStateMeta, visibilityLabels } from "@/features/developer-console/labels";
import { payloadIssues } from "@/features/developer-console/mock/engine";
import { initialPayloadFor } from "@/features/developer-console/mock/seed";
import type { ConsoleVisibility, DraftPayload } from "@/features/developer-console/model";

interface DraftForm {
  name: string;
  summary: string;
  version: string;
  visibility: ConsoleVisibility;
  overview: string;
}

function toForm(payload: DraftPayload | null): DraftForm {
  const overview = payload?.presentation.sections.find((section) => section.kind === "MARKDOWN");
  return {
    name: payload?.manifest.name ?? "",
    summary: payload?.manifest.summary ?? "",
    version: payload?.manifest.version ?? "",
    visibility: payload?.manifest.visibility ?? "PRIVATE",
    overview: overview && overview.kind === "MARKDOWN" ? overview.body : "",
  };
}

/** Writes the editable fields back into a full payload; presentation title/version follow the manifest. */
function applyForm(payload: DraftPayload, form: DraftForm): DraftPayload {
  const next: DraftPayload = JSON.parse(JSON.stringify(payload));
  next.manifest.name = form.name;
  next.manifest.summary = form.summary;
  next.manifest.version = form.version;
  next.manifest.visibility = form.visibility;
  next.presentation.title = form.name;
  next.presentation.version = form.version;
  const index = next.presentation.sections.findIndex((section) => section.kind === "MARKDOWN");
  if (index >= 0) {
    const section = next.presentation.sections[index];
    if (section.kind === "MARKDOWN") next.presentation.sections[index] = { ...section, body: form.overview };
  }
  return next;
}

const field = "premium-field h-11 px-4 text-sm";

export function DraftPanel({ api, ownEtags }: { api: DeskApi; ownEtags: MutableRefObject<Set<string>> }) {
  const { view } = api;
  const ids = useId();
  const [loaded, setLoaded] = useState({ etag: view.draft.etag, payload: view.draft.dto?.payload ?? null });
  const [template, setTemplate] = useState<DraftPayload | null>(null);
  const [form, setForm] = useState<DraftForm>(() => toForm(loaded.payload));
  const basePayload = loaded.payload ?? template;
  // An unsaved template counts as a local change; otherwise compare with what was loaded.
  const dirty = loaded.payload ? JSON.stringify(form) !== JSON.stringify(toForm(loaded.payload)) : Boolean(template);
  const editable = view.draft.head.state === "DRAFT";

  // Adopt server changes silently when they are ours or when nothing local would be lost.
  useEffect(() => {
    if (view.draft.etag === loaded.etag) return;
    if (ownEtags.current.has(view.draft.etag) || !dirty) {
      setLoaded({ etag: view.draft.etag, payload: view.draft.dto?.payload ?? null });
      setForm(toForm(view.draft.dto?.payload ?? null));
      setTemplate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to server ETag changes only
  }, [view.draft.etag]);

  const stale = view.draft.etag !== loaded.etag;
  const reload = () => {
    setLoaded({ etag: view.draft.etag, payload: view.draft.dto?.payload ?? null });
    setForm(toForm(view.draft.dto?.payload ?? null));
    setTemplate(null);
  };

  const candidate = useMemo(() => (basePayload ? applyForm(basePayload, form) : null), [basePayload, form]);
  const issues = candidate ? payloadIssues(candidate, view) : [];
  const versionTaken = Boolean(form.version) && view.versions.some((version) => version.version === form.version);

  const save = () => {
    if (!candidate) return;
    void api.send({ action: "EDIT_DRAFT", ifMatch: loaded.etag, input: candidate });
  };
  const submit = () => {
    void api.send({ action: "SUBMIT_REVIEW", ifMatch: view.draft.etag, input: { expectedContentHash: view.draft.contentHash ?? "" } });
  };

  const meta = (
    <>
      <ToneBadge tone={draftStateMeta[view.draft.head.state].tone}>{draftStateMeta[view.draft.head.state].label}</ToneBadge>
      <ContractBadge status="merged" />
    </>
  );

  return (
    <Panel id="draft" meta={meta} title="草稿">
      <Facts
        className="mb-5"
        items={[
          ["Draft", <Mono key="d">{view.draft.head.id}</Mono>],
          ["ETag", <Mono key="e">{view.draft.etag}</Mono>],
          ["内容哈希", <Mono key="h">{view.draft.contentHash ? `${shortHash(view.draft.contentHash, 16)} · JCS-SHA256-v1` : "—（尚无合法内容）"}</Mono>],
        ]}
      />

      {stale && dirty ? (
        <div className="mb-5 rounded-control border border-warning/40 bg-warning-subtle px-4 py-3 text-[.8125rem] text-warning-foreground" role="status">
          <p className="font-medium">草稿在你编辑期间被修改了（rev {loaded.etag.match(/:(\d+)"$/)?.[1]} → {view.draft.head.revision}）。</p>
          <p className="mt-1 text-[.75rem]">现在保存会携带过期的 ETag，协议会返回 412 PRECONDITION_FAILED，不会覆盖别人的修改。</p>
          <Button className="mt-2" onClick={reload} size="sm" variant="outline"><RotateCcw className="size-3.5" />载入最新（放弃本地修改）</Button>
        </div>
      ) : null}

      {!basePayload ? (
        <EmptyBlock
          action={editable ? <Button onClick={() => { const payload = initialPayloadFor(view.slug, view.name); setTemplate(payload); setForm(toForm(payload)); }} size="sm">用模板填写首次内容</Button> : undefined}
          title="草稿尚未初始化"
        >
          B1 创建项目时只写入空的 manifest 与 presentation。首次合法编辑之前只能读取草稿头，读取完整 DraftDTO 会得到 DRAFT_UNINITIALIZED。
        </EmptyBlock>
      ) : (
        <fieldset className="space-y-5" disabled={!editable}>
          <legend className="sr-only">草稿内容</legend>
          {!editable ? <p className="text-[.75rem] text-muted-foreground">{draftStateMeta[view.draft.head.state].detail}。</p> : null}
          <div className="grid gap-5 min-[640px]:grid-cols-[minmax(0,1fr)_10rem]">
            <div>
              <label className="text-[.8125rem] font-medium" htmlFor={`${ids}-name`}>名称</label>
              <input className={`${field} mt-2`} id={`${ids}-name`} maxLength={500} onChange={(event) => setForm({ ...form, name: event.target.value })} value={form.name} />
            </div>
            <div>
              <label className="text-[.8125rem] font-medium" htmlFor={`${ids}-version`}>版本</label>
              <input aria-describedby={`${ids}-version-note`} className={`${field} mt-2 font-code`} id={`${ids}-version`} inputMode="decimal" onChange={(event) => setForm({ ...form, version: event.target.value.trim() })} value={form.version} />
            </div>
          </div>
          <p className="-mt-3 text-[.6875rem] text-muted-foreground" id={`${ids}-version-note`}>
            MAJOR.MINOR.PATCH。{versionTaken ? <b className="font-medium text-warning-foreground">这个版本号已被封存过，封存时会返回 CONFLICT。</b> : "版本号在项目内唯一，封存后不可修改。"}
          </p>
          <div>
            <label className="text-[.8125rem] font-medium" htmlFor={`${ids}-summary`}>简介</label>
            <textarea className="premium-field mt-2 min-h-[5rem] resize-y px-4 py-3 text-sm leading-6" id={`${ids}-summary`} maxLength={500} onChange={(event) => setForm({ ...form, summary: event.target.value })} value={form.summary} />
          </div>
          <fieldset>
            <legend className="text-[.8125rem] font-medium">目标可见性</legend>
            <p className="mt-1 text-[.6875rem] text-muted-foreground">写进 Manifest 的目标，不会立即改变项目可见性；只有发布或撤回才会改变。</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["PRIVATE", "UNLISTED", "PUBLIC"] as ConsoleVisibility[]).map((key) => (
                <label className="cursor-pointer" key={key}>
                  <input checked={form.visibility === key} className="peer sr-only" name={`${ids}-visibility`} onChange={() => setForm({ ...form, visibility: key })} type="radio" value={key} />
                  <span className="inline-flex h-9 items-center rounded-full border border-foreground/20 px-4 text-[.8125rem] transition-colors duration-300 peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-disabled:opacity-50">{visibilityLabels[key].label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="text-[.8125rem] font-medium" htmlFor={`${ids}-overview`}>概览（Markdown）</label>
            <textarea className="premium-field mt-2 min-h-[7rem] resize-y px-4 py-3 font-code text-[.8125rem] leading-6" id={`${ids}-overview`} maxLength={20000} onChange={(event) => setForm({ ...form, overview: event.target.value })} value={form.overview} />
          </div>
          {issues.length ? (
            <ul className="space-y-1 text-[.75rem] text-destructive-foreground" role="alert">
              {issues.map((issue) => <li key={issue}>· {issue}</li>)}
            </ul>
          ) : null}
        </fieldset>
      )}

      {basePayload && editable ? (
        <div className="mt-6 flex flex-wrap items-start gap-3 border-t border-border/12 pt-5">
          <ActionButton action="EDIT_DRAFT" api={api} blockedReason={!dirty ? "没有未保存的修改" : issues.length ? "先修正上面的问题" : undefined} gate={api.gate("EDIT_DRAFT")} onRun={save}>
            保存草稿
          </ActionButton>
          <ActionButton action="SUBMIT_REVIEW" api={api} blockedReason={dirty ? "先保存修改，审核只针对已保存的内容" : !view.draft.dto ? "草稿尚未初始化" : undefined} gate={api.gate("SUBMIT_REVIEW")} onRun={submit} variant="outline">
            提交审核
          </ActionButton>
        </div>
      ) : null}
    </Panel>
  );
}
