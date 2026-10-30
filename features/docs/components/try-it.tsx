"use client";

import { useRef, useState } from "react";
import { Send, Square } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/features/demos/components/ui";
import { curlCommand, prettyJson } from "@/features/demos/components/format";
import { cn } from "@/lib/utils";

interface Preset {
  id: string;
  label: string;
  method: "GET" | "POST";
  path: string;
  stream?: boolean;
  body?: unknown;
  note: string;
}

const presets: Preset[] = [
  { id: "list", label: "能力列表", method: "GET", path: "/api/demo/v1/capabilities", note: "列出两个能力及其输入输出 Schema。" },
  { id: "run", label: "同步运行", method: "POST", path: "/api/demo/v1/runs", body: { capability: "route-optimizer.solve", input: { instance: { kind: "clustered", count: 120, seed: 7 }, improvement: "or-opt" } }, note: "一次返回终态 Run。" },
  { id: "stream", label: "事件流", method: "POST", path: "/api/demo/v1/runs", stream: true, body: { capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 250, seed: 3 }, improvement: "annealing", annealingIterations: 600000 } }, note: "Accept: text/event-stream，逐条显示 run.status 与 run.progress。" },
  { id: "timeout", label: "截止时间", method: "POST", path: "/api/demo/v1/runs", body: { capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 400 }, improvement: "annealing", annealingIterations: 3000000, deadlineMs: 50 } }, note: "50 ms 内无法完成 → TIMED_OUT，带部分结果。" },
  { id: "invalid", label: "错误示例", method: "POST", path: "/api/demo/v1/runs", body: { capability: "route-optimizer.solve", input: { points: [[1, 2]], color: "red" } }, note: "输入不符合契约 → 400，issues 指出问题位置。" },
];

const RESPONSE_HEADERS = ["content-type", "x-request-id", "x-run-id", "ratelimit-remaining", "retry-after"];

interface Result {
  status: number;
  ms: number;
  headers: [string, string][];
  body: string;
}

/** Sends real requests to the Demo Runtime API on this site and shows the raw answer. */
export function TryIt() {
  const [presetId, setPresetId] = useState(presets[1].id);
  const preset = presets.find((item) => item.id === presetId) ?? presets[0];
  const [bodies, setBodies] = useState<Record<string, string>>(() => Object.fromEntries(presets.map((item) => [item.id, item.body ? JSON.stringify(item.body, null, 2) : ""])));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const body = bodies[preset.id];

  async function send() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    const started = performance.now();
    try {
      const response = await fetch(preset.path, {
        method: preset.method,
        headers: preset.method === "POST" ? { "Content-Type": "application/json", ...(preset.stream ? { Accept: "text/event-stream" } : {}) } : undefined,
        body: preset.method === "POST" ? body : undefined,
        signal: controller.signal,
      });
      const headers = RESPONSE_HEADERS.flatMap((name) => {
        const value = response.headers.get(name);
        return value ? [[name, value] as [string, string]] : [];
      });
      const isStream = (response.headers.get("content-type") ?? "").includes("text/event-stream");
      if (isStream && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          text += decoder.decode(value, { stream: !done });
          const shown = text
            .split("\n\n")
            .filter(Boolean)
            .map((block) => block.replace(/"tour":\[[^\]]*\]/g, '"tour":[…]').replace(/"points":\[[\s\S]*?\]\]/g, '"points":[…]'))
            .slice(-40)
            .join("\n\n");
          setResult({ status: response.status, ms: Math.round(performance.now() - started), headers, body: shown });
          if (done) break;
        }
      } else {
        const raw = await response.text();
        let shown = raw;
        try {
          shown = prettyJson(JSON.parse(raw));
        } catch {
          /* not JSON: show as text */
        }
        setResult({ status: response.status, ms: Math.round(performance.now() - started), headers, body: shown });
      }
    } catch {
      if (!controller.signal.aborted) setError("请求没有完成：网络错误或连接被中断。");
    } finally {
      setBusy(false);
    }
  }

  const tone = !result ? "neutral" : result.status < 300 ? "success" : result.status === 429 || result.status >= 500 ? "warning" : "danger";

  return (
    <div className="not-prose my-8 overflow-hidden rounded-card bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/10 px-4 py-3">
        <p className="text-[.8125rem] font-medium">在线请求 · 发往本站的 Demo API</p>
        <ToneBadge dot tone="lime">真实请求 · 计入限流</ToneBadge>
      </div>
      <div className="grid gap-px bg-border/10 min-[1024px]:grid-cols-2">
        <div className="min-w-0 bg-surface p-4">
          <div className="flex flex-wrap gap-1" role="group" aria-label="示例请求">
            {presets.map((item) => (
              <button aria-pressed={item.id === preset.id} className={cn("min-h-9 rounded-full px-3 text-[.75rem] transition-colors", item.id === preset.id ? "bg-foreground text-background" : "border border-border/14 hover:border-foreground/30")} key={item.id} onClick={() => { setPresetId(item.id); setResult(null); setError(null); }} type="button">{item.label}</button>
            ))}
          </div>
          <p className="mt-3 font-code text-[.75rem]"><span className="font-medium">{preset.method}</span> {preset.path}{preset.stream ? "  ·  Accept: text/event-stream" : ""}</p>
          <p className="mt-1 text-[.75rem] text-muted-foreground">{preset.note}</p>
          {preset.method === "POST" ? (
            <textarea
              aria-label="请求体（JSON）"
              className="premium-field mt-3 h-48 resize-y p-3 font-code text-[.75rem] leading-5"
              onChange={(event) => setBodies((current) => ({ ...current, [preset.id]: event.target.value }))}
              spellCheck={false}
              value={body}
            />
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {busy ? <Button onClick={() => abort.current?.abort()} size="sm" variant="outline"><Square className="size-3.5" />中断</Button> : <Button onClick={send} size="sm"><Send className="size-3.5" />发送请求</Button>}
            <span className="text-[.6875rem] text-muted-foreground">可以改动请求体后再发送，看错误如何返回。</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
          <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[hsl(var(--paper)/.12)] pl-4 pr-1.5">
            <span className="flex items-center gap-2 font-code text-[.75rem]">
              {result ? <ToneBadge tone={tone}>HTTP {result.status}</ToneBadge> : <span className="text-[hsl(var(--paper)/.5)]">{busy ? "请求中…" : "响应"}</span>}
              {result ? <span className="text-[hsl(var(--paper)/.55)]">{result.ms} ms</span> : null}
            </span>
            <CopyButton text={curlCommand(`${typeof window === "undefined" ? "" : window.location.origin}${preset.path}`, preset.method === "POST" ? safeParse(body) : undefined, { stream: preset.stream })} />
          </div>
          <pre aria-live="polite" className="premium-scrollbar max-h-[24rem] min-h-[14rem] flex-1 overflow-auto p-4 font-code text-[.6875rem] leading-5 text-[hsl(var(--paper)/.85)]">
            {error ? <span className="text-[hsl(var(--lime))]">{error}</span> : result ? `${result.headers.map(([name, value]) => `${name}: ${value}`).join("\n")}\n\n${result.body}` : <span className="text-[hsl(var(--paper)/.45)]">选择一个示例并发送。右上角按钮复制等价的 curl 命令。</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
