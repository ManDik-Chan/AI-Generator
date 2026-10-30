"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { runStatusMeta } from "@/features/platform/labels";
import type { RunStatus } from "@/features/platform/types";
import { cn } from "@/lib/utils";

const cities = ["上海", "北京", "广州", "成都"];

interface LogLine {
  at: number;
  label: string;
  body: string;
}

/**
 * Shows how an L2 remote-API capability will be presented: data destination and consent
 * first, then 202 Accepted and polling. Everything here is a local simulation; no request
 * leaves the browser and the result text is a placeholder.
 */
export function ApiLab() {
  const [city, setCity] = useState(cities[0]);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const timers = useRef<number[]>([]);
  const started = useRef(0);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const push = (label: string, body: string) => setLog((lines) => [...lines, { at: Date.now() - started.current, label, body }]);

  const send = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    started.current = Date.now();
    setLog([]);
    setStatus("PENDING");
    push("POST /api/v1/projects/air-quality/runs", JSON.stringify({ capability: "summary.read.async", input: { city, date: "2026-10-30" } }, null, 2));
    timers.current = [
      window.setTimeout(() => { setStatus("ACCEPTED"); push("202 Accepted", JSON.stringify({ runId: "run_demo", statusUrl: "/api/v1/runs/run_demo" }, null, 2)); }, 500),
      window.setTimeout(() => { setStatus("RUNNING"); push("GET /api/v1/runs/run_demo", JSON.stringify({ status: "RUNNING" })); }, 1400),
      window.setTimeout(() => { setStatus("SUCCEEDED"); push("GET /api/v1/runs/run_demo", JSON.stringify({ status: "SUCCEEDED", visibility: "OWNER_ONLY" })); }, 2800),
    ];
  };

  const busy = status !== null && !runStatusMeta[status].terminal;

  return (
    <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="rounded-card bg-surface p-5">
        <p className="text-[.8125rem] font-medium">实验室 · 远程 API 调用</p>
        <p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">演示 L2 接入在平台上的样子。这里是本地模拟：不会发出任何请求，结果也只是占位文字。</p>
        <label className="mt-5 block text-[.75rem] text-muted-foreground" htmlFor="api-city">城市</label>
        <select className="premium-field mt-1.5 h-11 px-4 text-sm" disabled={busy} id="api-city" onChange={(event) => setCity(event.target.value)} value={city}>
          {cities.map((item) => <option key={item}>{item}</option>)}
        </select>
        <div className="mt-5 rounded-card border border-warning/30 bg-warning-subtle p-4 text-[.8125rem] leading-5 text-warning-foreground">
          <p className="font-medium">数据去向</p>
          <p className="mt-1">你选择的城市与日期会发送到「示例开发者」运营的服务。对方看不到你的账户信息；结果只有你可见。</p>
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[.8125rem] leading-5">
          <input checked={consent} className="mt-1 size-4 accent-[hsl(var(--foreground))]" disabled={busy} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
          <span>我同意本次输入交给项目运营方处理。</span>
        </label>
        <Button className="mt-5" disabled={!consent || busy} onClick={send} size="sm"><Send className="size-3.5" />发送（模拟）</Button>
      </div>
      <div className="flex min-h-[20rem] flex-col overflow-hidden rounded-card bg-[hsl(var(--ink))] text-[hsl(var(--paper))]" aria-live="polite">
        <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--paper)/.12)] px-4 py-3">
          <span className="font-code text-[.75rem] text-[hsl(var(--paper)/.7)]">请求与状态</span>
          {status ? <ToneBadge dot tone={runStatusMeta[status].tone}>{runStatusMeta[status].label}</ToneBadge> : <span className="text-[.6875rem] text-[hsl(var(--paper)/.5)]">等待发送</span>}
        </div>
        <ol className="premium-scrollbar flex-1 space-y-3 overflow-auto p-4">
          {log.map((line, index) => (
            <li className="enter" key={index}>
              <p className="flex items-center gap-2 font-code text-[.75rem]"><span className="text-[hsl(var(--paper)/.45)] tabular-nums">+{(line.at / 1000).toFixed(1)}s</span><span className={cn(line.label.startsWith("202") ? "text-lime" : "text-[hsl(var(--paper))]")}>{line.label}</span></p>
              <pre className="mt-1 overflow-x-auto rounded-control bg-[hsl(var(--paper)/.06)] p-3 font-code text-[.6875rem] leading-5 text-[hsl(var(--paper)/.8)]">{line.body}</pre>
            </li>
          ))}
          {status === "SUCCEEDED" ? (
            <li className="enter rounded-control bg-[hsl(var(--paper))] p-4 text-[hsl(var(--ink))]">
              <p className="text-[.6875rem] text-[hsl(var(--ink)/.6)]">结果 · 仅你可见 · 占位文字</p>
              <p className="mt-1 text-sm">{city} · 示例摘要：这里将显示开发者服务返回的空气质量摘要。本次为本地模拟，没有任何真实数据。</p>
            </li>
          ) : null}
          {!log.length ? <li className="py-10 text-center text-[.75rem] text-[hsl(var(--paper)/.5)]">勾选同意并发送后，这里会依次出现请求、202 Accepted 与状态轮询。</li> : null}
        </ol>
      </div>
    </div>
  );
}
