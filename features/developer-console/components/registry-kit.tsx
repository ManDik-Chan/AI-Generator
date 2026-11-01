"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock, RefreshCw } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/features/developer-console/labels";
import type { ReadError } from "@/features/developer-console/registry/contract";
import type { ListSlot, Slot } from "@/features/developer-console/registry/store";
import { readErrorText, statusText, type ReadScope } from "@/features/developer-console/registry/view";
import { cn } from "@/lib/utils";

/** Fixed notice on every Registry screen: real data, read-only, no fallback. */
export function ReadOnlyNotice({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-card bg-surface px-4 py-3 text-xs leading-5 text-muted-foreground", className)} role="note">
      <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-foreground" />
      <p>
        <b className="font-medium text-foreground">Registry 只读</b> · 以你当前登录的身份通过内部 GET 接口读取真实数据。编辑、审核、封存、发布、撤回、回滚与资产操作在这个模式下都不可用，控制台不会发送任何写请求；读取失败时显示真实错误，不会改用示例数据。
      </p>
    </div>
  );
}

export function ErrorNote({ error, scope, className, stale }: { error: ReadError; scope: ReadScope; className?: string; stale?: number | null }) {
  const text = readErrorText(error, scope);
  const tones = { danger: "bg-destructive-subtle text-destructive-foreground", warning: "bg-warning-subtle text-warning-foreground" } as Record<string, string>;
  return (
    <div className={cn("rounded-control px-4 py-3 text-[.8125rem]", tones[text.tone] ?? "border border-dashed border-foreground/18", className)} role="status">
      <p className="font-medium"><span className="font-code">{statusText(error)}</span> · {text.title}</p>
      <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">{text.detail}</p>
      {error.retryAt ? <p className="mt-1 font-code text-[.6875rem]">可在 {formatClock(error.retryAt)} 后重新读取</p> : null}
      {stale ? <p className="mt-1 text-[.6875rem]">下方保留的是 {formatClock(stale)} 读取的结果。</p> : null}
    </div>
  );
}

/** Loading / error state of one slot; renders `children` once data may be shown. */
export function SlotBody<T>({ slot, scope, children, empty }: { slot: Slot<T>; scope: ReadScope; children: (data: T) => ReactNode; empty?: ReactNode }) {
  if (slot.status === "idle" || (slot.status === "loading" && slot.data === null)) return <Pending />;
  return (
    <>
      {slot.error ? <ErrorNote className={slot.data !== null ? "mb-4" : undefined} error={slot.error} scope={scope} stale={slot.data !== null ? slot.readAt : null} /> : null}
      {slot.data !== null ? children(slot.data) : slot.error ? null : empty}
    </>
  );
}

export function ListBody<T>({ slot, scope, children, empty }: { slot: ListSlot<T>; scope: ReadScope; children: (items: T[]) => ReactNode; empty: ReactNode }) {
  if (slot.status === "idle" || (slot.status === "loading" && slot.readAt === null)) return <Pending />;
  const shown = slot.readAt !== null;
  return (
    <>
      {slot.error ? <ErrorNote className={shown ? "mb-4" : undefined} error={slot.error} scope={scope} stale={shown ? slot.readAt : null} /> : null}
      {shown ? (slot.items.length ? children(slot.items) : empty) : null}
    </>
  );
}

function Pending() {
  return <p aria-busy="true" className="text-[.8125rem] text-muted-foreground">正在读取…</p>;
}

/** "Load more" for exclusive-cursor pages, with the ordering caveat while pages remain. */
export function MoreRows({ slot, onMore, orderedBy, scope }: { slot: ListSlot<unknown>; onMore: () => void; orderedBy: string; scope: ReadScope }) {
  if (slot.readAt === null || !slot.items.length) return null;
  return (
    <div className="mt-4 space-y-2 text-[.6875rem] text-muted-foreground">
      <p>已读取 {slot.items.length} 条，按{orderedBy}排序{slot.nextCursor ? "；还有未读取的页，排序只覆盖已读取的部分" : ""}。服务端分页按 ID 顺序，不代表时间先后。</p>
      {slot.moreError ? <ErrorNote error={slot.moreError} scope={scope} /> : null}
      {slot.nextCursor ? (
        <Button disabled={slot.loadingMore || slot.status === "loading"} loading={slot.loadingMore} onClick={onMore} size="sm" variant="outline">读取下一页</Button>
      ) : null}
    </div>
  );
}

export function RefreshButton({ refreshing, blockedUntil, lastRefresh, onRefresh }: { refreshing: boolean; blockedUntil: number | null; lastRefresh: number | null; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={refreshing || blockedUntil !== null} loading={refreshing} onClick={onRefresh} size="lg" variant="outline">
        {refreshing ? null : <RefreshCw className="size-4" />}重新读取
      </Button>
      <span aria-live="polite" className="text-[.75rem] text-muted-foreground">
        {blockedUntil !== null ? `读取已暂停，${formatClock(blockedUntil)} 后恢复` : refreshing ? "读取中…" : lastRefresh !== null ? `上次读取 ${formatClock(lastRefresh)}` : "尚未读取"}
      </span>
    </div>
  );
}

/** Session-wide outcome: signed out or the read API is switched off. Replaces every section. */
export function GateBlock({ gate, returnPath, mockHref }: { gate: ReadError; returnPath: string; mockHref: string }) {
  const text = readErrorText(gate, "overview");
  return (
    <section aria-labelledby="registry-gate" className="rounded-card border border-dashed border-foreground/18 px-5 py-10 text-center">
      <ToneBadge tone={text.tone}>{statusText(gate)}</ToneBadge>
      <h2 className="mt-3 text-[1.0625rem] font-medium" id="registry-gate">{text.title}</h2>
      <p className="mx-auto mt-1.5 max-w-lg text-[.8125rem] leading-6 text-muted-foreground">{text.detail}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {gate.code === "AUTH_REQUIRED" ? (
          <Button asChild><Link href={`/login?next=${encodeURIComponent(returnPath)}`} prefetch={false}>重新登录</Link></Button>
        ) : null}
        <Button asChild variant="outline"><Link href={mockHref} prefetch={false}>打开 Mock 演示</Link></Button>
      </div>
      {gate.code === "DISABLED" ? <p className="mx-auto mt-4 max-w-lg text-[.6875rem] text-muted-foreground">Mock 演示是单独的示例数据，不代表你在 Registry 中的项目。</p> : null}
    </section>
  );
}

/** One row of the "reads" sidebar: what was requested, its outcome and its ETag. */
export function ReadRow({ label, slot }: { label: string; slot: { status: string; readAt: number | null; error: ReadError | null; etag?: string | null; changed?: boolean } }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-border/12 py-2 last:border-b-0">
      <span className="font-code text-[.6875rem]">{label}</span>
      <span className="text-right text-[.6875rem]">
        {slot.error ? <span className="font-code text-destructive-foreground">{statusText(slot.error)}</span>
          : slot.status === "loading" || slot.status === "idle" ? <span className="text-muted-foreground">读取中</span>
          : <span className="font-code text-success-foreground">200</span>}
      </span>
      {slot.etag ? <span className="col-span-2 break-all font-code text-[.625rem] text-muted-foreground">ETag {slot.etag}{slot.changed ? " · 已变化" : ""}</span> : null}
      {slot.readAt !== null ? <span className="col-span-2 text-[.625rem] text-muted-foreground">读取于 {formatClock(slot.readAt)}</span> : null}
    </li>
  );
}
