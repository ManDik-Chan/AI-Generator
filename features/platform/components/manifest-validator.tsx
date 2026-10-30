"use client";

import { useMemo, useState } from "react";
import { Braces, RotateCcw, Trash2 } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { exampleManifest, validateManifest } from "@/features/platform/manifest";
import { cn } from "@/lib/utils";

/** Validates a manifest in the browser as you type. Nothing is uploaded. */
export function ManifestValidator() {
  const [text, setText] = useState(exampleManifest);
  const result = useMemo(() => validateManifest(text), [text]);
  const errors = result.issues.filter((issue) => issue.level === "error");
  const warnings = result.issues.filter((issue) => issue.level === "warning");
  const lines = text.split("\n").length;

  const format = () => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      /* invalid JSON stays as typed; the error list explains why */
    }
  };

  return (
    <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col overflow-hidden rounded-card bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--paper)/.12)] px-4 py-2.5">
          <span className="font-code text-[.75rem] text-[hsl(var(--paper)/.7)]">manifest.json · {lines} 行</span>
          <span className="flex gap-1">
            {[
              { label: "格式化", icon: Braces, onClick: format },
              { label: "载入示例", icon: RotateCcw, onClick: () => setText(exampleManifest) },
              { label: "清空", icon: Trash2, onClick: () => setText("") },
            ].map((action) => (
              <button className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[.75rem] text-[hsl(var(--paper)/.75)] transition-colors hover:bg-[hsl(var(--paper)/.1)] hover:text-[hsl(var(--paper))]" key={action.label} onClick={action.onClick} type="button">
                <action.icon aria-hidden="true" className="size-3.5" />{action.label}
              </button>
            ))}
          </span>
        </div>
        <label className="sr-only" htmlFor="manifest-editor">Manifest JSON</label>
        <textarea
          className="premium-scrollbar min-h-[26rem] w-full flex-1 resize-y bg-transparent p-4 font-code text-[.8125rem] leading-[1.7] text-[hsl(var(--paper))] outline-none placeholder:text-[hsl(var(--paper)/.4)]"
          id="manifest-editor"
          onChange={(event) => setText(event.target.value)}
          placeholder="粘贴你的 manifest.json…"
          spellCheck={false}
          value={text}
        />
      </div>
      <div className="flex min-w-0 flex-col rounded-card bg-surface p-5" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">校验结果</p>
          <ToneBadge dot tone={result.ok ? "success" : "danger"}>{result.ok ? "符合 P0.5 契约" : `${errors.length} 个错误`}</ToneBadge>
        </div>
        <p className="mt-1 text-[.75rem] text-muted-foreground">{warnings.length ? `另有 ${warnings.length} 条建议。` : "错误会阻止提交；建议不会。"}</p>
        <ul className="mt-5 space-y-2">
          {result.issues.map((issue, index) => (
            <li className={cn("rounded-control px-3 py-2.5", issue.level === "error" ? "bg-destructive-subtle" : "bg-warning-subtle")} key={`${issue.path}-${index}`}>
              <p className={cn("font-code text-[.75rem] font-medium", issue.level === "error" ? "text-destructive-foreground" : "text-warning-foreground")}>{issue.path}</p>
              <p className="mt-0.5 text-[.75rem] leading-5 text-foreground/80">{issue.message}</p>
            </li>
          ))}
          {result.ok && !result.issues.length ? (
            <li className="rounded-control bg-success-subtle px-3 py-3 text-[.8125rem] leading-5 text-success-foreground">全部字段通过。提交后它会成为草稿的一部分，由独立审核人检查后封存为不可变版本。</li>
          ) : null}
        </ul>
        <p className="mt-auto pt-6 text-[.6875rem] leading-5 text-muted-foreground">校验在浏览器内完成，内容不会上传。规则来自 P0.5 manifest 契约草案（schemaVersion 0.5.0）。</p>
      </div>
    </div>
  );
}
