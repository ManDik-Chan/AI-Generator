"use client";

import { RotateCw } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Mono } from "@/features/developer-console/components/desk-kit";
import { errorMeta, formatClock } from "@/features/developer-console/labels";
import type { ProtocolLogEntry } from "@/features/developer-console/model";

function preview(value: unknown, max = 1400) {
  const text = JSON.stringify(value, null, 2) ?? "";
  return text.length > max ? `${text.slice(0, max)}\n…（已截断）` : text;
}

/**
 * Every command this tab sent, newest first, as the library call it maps to: If-Match,
 * Idempotency-Key, input, and the response or stable error code.
 */
export function ProtocolLog({ entries, personaName, onReplay, busy }: { entries: ProtocolLogEntry[]; personaName: (id: string) => string; onReplay: (seq: number) => void; busy: boolean }) {
  if (!entries.length) {
    return <p className="text-[.75rem] leading-5 text-muted-foreground">还没有请求。每次操作都会在这里记录对应的库函数、If-Match、Idempotency-Key 和响应。</p>;
  }
  return (
    <ol aria-label="协议日志" className="space-y-2">
      {entries.map((entry) => {
        const { result } = entry;
        return (
          <li className="rounded-control bg-surface-raised p-3 text-[.75rem]" key={entry.seq}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="font-code text-muted-foreground">#{entry.seq}</span>
                <Mono className="font-medium">{entry.fn}</Mono>
              </span>
              {result.ok
                ? <ToneBadge tone="success">{result.response.replayed ? "成功 · 重放" : "成功"}</ToneBadge>
                : <ToneBadge tone="danger">{result.error.status} {result.error.code}</ToneBadge>}
            </div>
            <p className="mt-1 text-[.6875rem] text-muted-foreground">{formatClock(entry.at)} · {personaName(entry.personaId)}{entry.replayOf ? ` · 重放 #${entry.replayOf}` : ""}</p>
            {!result.ok ? <p className="mt-1.5 text-[.6875rem] leading-4">{errorMeta[result.error.code].title}</p> : null}
            <details className="mt-2">
              <summary className="cursor-pointer text-[.6875rem] text-muted-foreground">请求与响应</summary>
              <dl className="mt-2 space-y-1">
                <div><dt className="inline text-muted-foreground">If-Match </dt><dd className="inline"><Mono>{entry.ifMatch ?? "（缺失）"}</Mono></dd></div>
                <div><dt className="inline text-muted-foreground">Idempotency-Key </dt><dd className="inline"><Mono>{entry.idempotencyKey}</Mono></dd></div>
                {result.ok ? <div><dt className="inline text-muted-foreground">ETag </dt><dd className="inline"><Mono>{result.response.etag}</Mono></dd></div> : null}
              </dl>
              <p className="mt-2 text-[.6875rem] text-muted-foreground">input</p>
              <pre className="scroll-x mt-1 max-h-48 overflow-y-auto rounded-control bg-surface p-2 font-code text-[.6875rem] leading-4">{preview(entry.input)}</pre>
              <p className="mt-2 text-[.6875rem] text-muted-foreground">{result.ok ? "result" : "error"}</p>
              <pre className="scroll-x mt-1 max-h-48 overflow-y-auto rounded-control bg-surface p-2 font-code text-[.6875rem] leading-4">{preview(result.ok ? result.response.result : result.error)}</pre>
              <button className="mt-2 inline-flex items-center gap-1 text-[.6875rem] font-medium link-grow disabled:opacity-50" disabled={busy} onClick={() => onReplay(entry.seq)} type="button">
                <RotateCw aria-hidden="true" className="size-3" />用同一个 Idempotency-Key 重放
              </button>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
