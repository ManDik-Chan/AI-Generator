"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";

import { SectionHead, ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-field";
import { Mono } from "@/features/developer-console/components/desk-kit";
import { useNow, useRegistryCreate } from "@/features/developer-console/components/registry-provider";
import { formatClock } from "@/features/developer-console/labels";
import type { CreateSnapshot } from "@/features/developer-console/registry/create-store";
import { SLUG_PATTERN } from "@/features/developer-console/registry/write-contract";
import { unknownText, writeErrorText, writeStatusText } from "@/features/developer-console/registry/write-view";
import { cn } from "@/lib/utils";

export function CreateProjectPanel({ base }: { base: string }) {
  const { snapshot, store } = useRegistryCreate();
  const now = useNow();
  return (
    <CreateProjectView
      base={base}
      now={now}
      onAbandon={() => store.abandon()}
      onReset={() => store.reset()}
      onRetry={() => void store.retry()}
      onSubmit={(slug) => void store.submit(slug)}
      snapshot={snapshot}
    />
  );
}

const box = "rounded-control px-4 py-3 text-[.8125rem]";

export function CreateProjectView({ snapshot, base, now, onSubmit, onRetry, onAbandon, onReset }: {
  snapshot: CreateSnapshot; base: string; now: number; onSubmit: (slug: string) => void; onRetry: () => void; onAbandon: () => void; onReset: () => void;
}) {
  const id = useId();
  const [slug, setSlug] = useState("");
  const { phase, denied, created, error, attempt } = snapshot;
  const busy = phase === "sending";
  const locked = phase === "unknown" || busy;
  const value = locked && attempt ? attempt.slug : slug;
  const invalid = value.length > 0 && !SLUG_PATTERN.test(value);
  const blocked = snapshot.blockedUntil !== null && snapshot.blockedUntil > now;

  return (
    <section aria-labelledby="rg-create">
      <SectionHead id="rg-create" meta={<ToneBadge tone="neutral">POST …/projects</ToneBadge>}>创建项目</SectionHead>
      <div className="grid gap-x-10 gap-y-6 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {denied ? (
            <div className={cn(box, "border border-dashed border-foreground/18")} role="status">
              <p className="font-medium"><span className="font-code">{writeStatusText(denied)}</span> · {writeErrorText(denied, "create").title}</p>
              <p className="mt-0.5 text-[.75rem] leading-5 text-muted-foreground">
                {writeErrorText(denied, "create").detail} 服务端于 {formatClock(denied.at)} 给出这个结果；本次访问不再提供创建入口。资格变化后重新打开控制台即可再试。
              </p>
            </div>
          ) : phase === "created" && created ? (
            <div className={cn(box, "bg-success-subtle text-success-foreground")} role="status">
              <p className="font-medium">已创建 <span className="font-code">/{created.slug}</span>{created.replayed ? "（重放：服务端返回了先前同一请求创建的项目）" : ""}</p>
              <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">服务端于 {formatClock(created.at)} 确认（201）。项目为私有，你是 OWNER；草稿是空的，需要第一次保存才有内容。</p>
              <Mono className="mt-1 block opacity-80">{created.id}</Mono>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm"><Link href={`${base}/projects/${created.id}`} prefetch={false}>打开项目<ArrowRight className="size-3.5" /></Link></Button>
                <Button onClick={() => { setSlug(""); onReset(); }} size="sm" variant="outline">再创建一个</Button>
              </div>
            </div>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!locked && !blocked && SLUG_PATTERN.test(slug)) onSubmit(slug);
              }}
            >
              <Field
                error={invalid ? "3–63 个字符：小写字母开头，只含小写字母、数字和连字符。" : undefined}
                help="项目地址的一部分，创建后不能修改。"
                htmlFor={`${id}-slug`}
                label="Slug"
                required
              >
                <Input
                  aria-invalid={invalid || undefined}
                  autoCapitalize="none"
                  autoComplete="off"
                  className="font-code"
                  disabled={locked}
                  id={`${id}-slug`}
                  maxLength={63}
                  onChange={(event) => setSlug(event.target.value.trim())}
                  placeholder="my-project"
                  spellCheck={false}
                  value={value}
                />
              </Field>

              {phase === "unknown" ? (
                <div className={cn(box, "bg-warning-subtle text-warning-foreground")} role="alert">
                  <p className="font-medium">结果未知：项目可能已经创建</p>
                  <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">
                    {snapshot.unknownReason ? unknownText(snapshot.unknownReason) : null} 用同一请求重试是安全的：如果先前已经创建，服务端会返回同一个项目，不会重复创建。已发送 {snapshot.sends} 次。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button disabled={blocked} onClick={onRetry} size="sm">用同一请求重试</Button>
                    <Button onClick={onAbandon} size="sm" variant="outline">放弃这个请求</Button>
                  </div>
                </div>
              ) : null}

              {phase === "rejected" && error ? (
                <div className={cn(box, error.code === "CONFLICT" || error.code === "RATE_LIMITED" ? "bg-warning-subtle text-warning-foreground" : "bg-destructive-subtle text-destructive-foreground")} role="alert">
                  <p className="font-medium"><span className="font-code">{writeStatusText(error)}</span> · {writeErrorText(error, "create").title}</p>
                  <p className="mt-0.5 text-[.75rem] leading-5 opacity-90">{writeErrorText(error, "create").detail}</p>
                  {error.retryAt ? <p className="mt-1 font-code text-[.6875rem]">可在 {formatClock(error.retryAt)} 后再试</p> : null}
                </div>
              ) : null}

              {phase !== "unknown" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={busy || blocked || !SLUG_PATTERN.test(slug)} loading={busy} type="submit">
                    {busy ? null : <Plus className="size-4" />}创建私有项目
                  </Button>
                  {blocked ? <span className="text-[.75rem] text-muted-foreground">写入已暂停，{formatClock(snapshot.blockedUntil!)} 后恢复</span> : null}
                </div>
              ) : null}
            </form>
          )}
        </div>
        <div className="space-y-2 text-[.75rem] leading-5 text-muted-foreground">
          <p>
            <b className="font-medium text-foreground">只面向有资格的内部操作员。</b>
            创建需要有效、未到期、带创建权限的内部操作员身份。这项资格目前不在上方的资格列表里返回，所以控制台事先无法确认：提交后由服务端判定，没有资格会得到 403，不会创建任何内容。
          </p>
          <p>新项目是私有的，你成为它的 OWNER，并得到一份空草稿。OWNER 角色不包含 EDIT_DRAFT 等平台资格，编辑草稿需要另外授予。</p>
        </div>
      </div>
    </section>
  );
}
