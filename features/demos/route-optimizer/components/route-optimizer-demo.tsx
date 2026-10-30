"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { BarChart3, Pencil, Play, RotateCcw, Shuffle, Square } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { CodeTabs, LineChart, Metric, Panel, RunTimeline, Segmented, Slider } from "@/features/demos/components/ui";
import { curlCommand, formatNumber, formatPercent, prettyJson, stopReasonLabels } from "@/features/demos/components/format";
import type { ApiErrorBody } from "@/features/demos/runtime/errors";
import type { Run } from "@/features/demos/runtime/run";
import { generateInstance, instanceKinds, instanceLabels, PLANE, type InstanceKind } from "@/features/demos/route-optimizer/instances";
import { MAX_POINTS, MIN_POINTS, type RouteOutput, type RouteProgress } from "@/features/demos/route-optimizer/schema";
import type { Construction, Improvement } from "@/features/demos/route-optimizer/solver";
import { readSseEvents } from "@/features/generation/client-sse";
import { runStatusMeta } from "@/features/platform/labels";
import { isTerminal } from "@/features/platform/run-lifecycle";
import type { RunStatus } from "@/features/platform/types";
import { cn } from "@/lib/utils";

const ENDPOINT = "/api/demo/v1/runs";
const CAPABILITY = "route-optimizer.solve";

const improvementOptions: { value: Improvement; label: string; hint: string }[] = [
  { value: "none", label: "不改进", hint: "只看构造出的路线" },
  { value: "two-opt", label: "2-opt", hint: "交换两条边，直到没有更短的交换" },
  { value: "or-opt", label: "2-opt + Or-opt", hint: "再把 1–3 个城市整段挪到别处" },
  { value: "annealing", label: "模拟退火", hint: "允许暂时变差以跳出局部最优，最后用 2-opt 打磨" },
];
const constructionOptions: { value: Construction; label: string }[] = [
  { value: "nearest-neighbor", label: "最近邻" },
  { value: "random", label: "随机" },
];

type Point = [number, number];

type ClientError = { kind: "http"; status: number; body: ApiErrorBody | null; retryAfter: string | null } | { kind: "network"; message: string };

interface ClientRun {
  phase: "idle" | "running" | "done" | "error";
  points: Point[] | null;
  request: unknown;
  transitions: { status: RunStatus; at: string }[];
  progress: RouteProgress | null;
  run: Run<RouteOutput> | null;
  error: ClientError | null;
  events: string[];
  cancelled: boolean;
}

const idle: ClientRun = { phase: "idle", points: null, request: null, transitions: [], progress: null, run: null, error: null, events: [], cancelled: false };

interface CompareRow {
  improvement: Improvement;
  status: RunStatus | "ERROR";
  length?: number;
  gap?: number;
  elapsedMs?: number;
  stopReason?: string;
  message?: string;
}

const logEvent = (events: string[], line: string) => (events.length >= 80 ? [...events.slice(-79), line] : [...events, line]);

/** Annealing iterations on a log slider: 10^3 … 3·10^6. */
const toIterations = (t: number) => Math.round(10 ** (3 + t * (Math.log10(3e6) - 3)) / 1000) * 1000;
const fromIterations = (n: number) => (Math.log10(n) - 3) / (Math.log10(3e6) - 3);

export function RouteOptimizerDemo() {
  const [kind, setKind] = useState<InstanceKind>("clustered");
  const [count, setCount] = useState(200);
  const [seed, setSeed] = useState(7);
  const [custom, setCustom] = useState<Point[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [construction, setConstruction] = useState<Construction>("nearest-neighbor");
  // Default to a run long enough (~0.3 s) to watch the tour improve over the event stream.
  const [improvement, setImprovement] = useState<Improvement>("annealing");
  const [annealT, setAnnealT] = useState(fromIterations(2_000_000));
  const [deadline, setDeadline] = useState(2000);
  const [state, setState] = useState<ClientRun>(idle);
  const [compare, setCompare] = useState<{ running: boolean; rows: CompareRow[] } | null>(null);
  const [origin, setOrigin] = useState("https://www.ai-mdc.com");
  const abortRef = useRef<AbortController | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => () => abortRef.current?.abort(), []);

  const generated = useMemo(() => generateInstance(kind, count, seed), [kind, count, seed]);
  const points = custom ?? generated;
  const busy = state.phase === "running" || Boolean(compare?.running);
  const iterations = toIterations(annealT);

  const input = (overrides: Partial<{ improvement: Improvement }> = {}) => {
    const strategy = overrides.improvement ?? improvement;
    return {
      ...(custom ? { points: custom } : { instance: { kind, count, seed } }),
      construction,
      improvement: strategy,
      ...(strategy === "annealing" ? { annealingIterations: iterations } : {}),
      deadlineMs: deadline,
      seed,
    };
  };
  const requestBody = { capability: CAPABILITY, input: input() };

  // A new point set invalidates the drawn tour.
  const resetRun = () => {
    abortRef.current?.abort();
    setState(idle);
    setCompare(null);
  };

  async function solve() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCompare(null);
    setState({ ...idle, phase: "running", points, request: requestBody });
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setState((s) => ({ ...s, phase: "error", error: { kind: "http", status: response.status, body, retryAfter: response.headers.get("retry-after") }, events: logEvent(s.events, `HTTP ${response.status} ${body?.code ?? ""}`) }));
        return;
      }
      let finished = false;
      await readSseEvents<{ event: string; data: unknown }>(response, ({ event, data }) => {
        if (event === "run.status") {
          const run = data as Run<RouteOutput>;
          const terminal = isTerminal(run.status);
          finished ||= terminal;
          setState((s) => ({ ...s, transitions: run.transitions, run: terminal ? run : s.run, phase: terminal ? "done" : s.phase, events: logEvent(s.events, `event: run.status  ${run.status}`) }));
        } else if (event === "run.progress") {
          const progress = (data as { data: RouteProgress }).data;
          setState((s) => ({ ...s, progress, events: logEvent(s.events, `event: run.progress  phase=${progress.phase} length=${progress.length} iterations=${progress.iterations}`) }));
        }
      });
      if (!finished && !controller.signal.aborted) {
        setState((s) => ({ ...s, phase: "error", error: { kind: "network", message: "事件流在运行结束前断开了。" } }));
      }
    } catch {
      if (controller.signal.aborted) {
        setState((s) => (s.phase === "running" ? { ...s, phase: "done", cancelled: true, transitions: [...s.transitions, { status: "CANCELLED", at: new Date().toISOString() }], events: logEvent(s.events, "客户端已断开连接 → 服务端在下一个检查点停止计算") } : s));
      } else {
        setState((s) => ({ ...s, phase: "error", error: { kind: "network", message: "网络请求失败，请检查连接后重试。" } }));
      }
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function compareAll() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...idle, points });
    const rows: CompareRow[] = [];
    setCompare({ running: true, rows: [] });
    for (const option of improvementOptions) {
      if (controller.signal.aborted) break;
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ capability: CAPABILITY, input: input({ improvement: option.value }) }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
          rows.push({ improvement: option.value, status: "ERROR", message: body?.message ?? `HTTP ${response.status}` });
          setCompare({ running: true, rows: [...rows] });
          break;
        }
        const run = (await response.json()) as Run<RouteOutput>;
        rows.push({ improvement: option.value, status: run.status, length: run.output?.length, gap: run.output?.gap, elapsedMs: run.output?.elapsedMs, stopReason: run.output?.stopReason });
        setCompare({ running: true, rows: [...rows] });
      } catch {
        if (!controller.signal.aborted) rows.push({ improvement: option.value, status: "ERROR", message: "网络请求失败" });
        break;
      }
    }
    setCompare({ running: false, rows: [...rows] });
  }

  function onCanvasPointer(event: PointerEvent<SVGSVGElement>) {
    if (!editing || busy || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * PLANE * 10) / 10;
    const y = Math.round(((event.clientY - rect.top) / rect.height) * PLANE * 10) / 10;
    const base = custom ?? generated;
    const hit = base.findIndex(([px, py]) => Math.hypot(px - x, py - y) < 18);
    if (hit >= 0) {
      if (base.length <= MIN_POINTS) return;
      setCustom(base.filter((_, index) => index !== hit));
    } else if (base.length < MAX_POINTS) {
      setCustom([...base, [Math.min(PLANE, Math.max(0, x)), Math.min(PLANE, Math.max(0, y))]]);
    }
    resetRun();
  }

  const drawnFor = state.points === points;
  const tour = drawnFor ? (state.run?.output?.tour ?? state.progress?.tour ?? null) : null;
  const path = tour && tour.length === points.length ? `M${tour.map((index) => `${points[index][0]},${points[index][1]}`).join("L")}Z` : null;
  const output = drawnFor ? state.run?.output ?? null : null;
  const status: RunStatus | null = state.cancelled ? "CANCELLED" : state.run?.status ?? (state.phase === "running" ? state.transitions.at(-1)?.status ?? "PENDING" : null);
  const liveLength = state.progress?.length;

  const responseCode = state.run ? prettyJson(state.run) : state.error?.kind === "http" ? prettyJson(state.error.body) : "";

  return (
    <div className="space-y-0.5">
      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.45fr)_minmax(19rem,1fr)]">
        <Panel
          meta={<span className="flex items-center gap-2">{status ? <ToneBadge dot tone={runStatusMeta[status].tone}>{runStatusMeta[status].label}</ToneBadge> : <span>{points.length} 个城市</span>}</span>}
          title={editing ? "编辑模式：点空白处加城市，点已有城市删除" : "城市与路线"}
        >
          <div className="p-3 min-[640px]:p-4">
            <svg
              aria-label={`${points.length} 个城市${path ? `，当前路线长度 ${output?.length ?? liveLength ?? ""}` : "，尚未求解"}`}
              className={cn("block aspect-square w-full touch-manipulation rounded-[3px] bg-background", editing && !busy && "cursor-crosshair ring-2 ring-[hsl(var(--lime))]")}
              onPointerDown={onCanvasPointer}
              ref={svgRef}
              role="img"
              viewBox={`0 0 ${PLANE} ${PLANE}`}
            >
              {[250, 500, 750].map((v) => (
                <g className="stroke-border/[.07]" key={v}>
                  <line x1={v} x2={v} y1={0} y2={PLANE} />
                  <line x1={0} x2={PLANE} y1={v} y2={v} />
                </g>
              ))}
              {path ? <path className={cn("fill-none stroke-[hsl(var(--primary))] transition-opacity duration-300", state.phase === "running" && "opacity-70")} d={path} strokeLinejoin="round" strokeWidth={3.2} /> : null}
              {points.map(([x, y], index) => (
                <circle className={index === 0 ? "fill-[hsl(var(--lime))] stroke-foreground" : "fill-foreground"} cx={x} cy={y} key={`${index}-${x}-${y}`} r={index === 0 ? 10 : points.length > 250 ? 4.5 : 6.5} strokeWidth={index === 0 ? 3 : 0} />
              ))}
            </svg>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {state.phase === "running" ? (
                <Button onClick={cancel} size="sm" variant="outline"><Square className="size-3.5" />取消运行</Button>
              ) : (
                <Button disabled={busy} onClick={solve} size="sm"><Play className="size-3.5" />在服务端求解</Button>
              )}
              <Button disabled={busy} onClick={compareAll} size="sm" variant="outline"><BarChart3 className="size-3.5" />对比四种策略</Button>
              <Button aria-pressed={editing} disabled={busy} onClick={() => setEditing((value) => !value)} size="sm" variant="ghost"><Pencil className="size-3.5" />{editing ? "完成编辑" : "编辑城市"}</Button>
              {custom ? <Button disabled={busy} onClick={() => { setCustom(null); setEditing(false); resetRun(); }} size="sm" variant="ghost"><RotateCcw className="size-3.5" />恢复生成的点</Button> : null}
              <span className="ml-auto text-[.6875rem] text-muted-foreground">起点（黄色）固定为第 0 个城市</span>
            </div>
          </div>
        </Panel>

        <Panel meta="改动参数后重新求解" title="参数">
          <div className="space-y-5 p-4">
            <Segmented columns={2} disabled={busy || Boolean(custom)} label={custom ? "点集（已手动编辑）" : "点集"} onChange={(value) => { setKind(value); resetRun(); }} options={instanceKinds.map((value) => ({ value, label: instanceLabels[value] }))} value={kind} />
            <Slider disabled={busy || Boolean(custom)} label="城市数量" max={MAX_POINTS} min={10} onChange={(value) => { setCount(value); resetRun(); }} step={10} value={custom ? custom.length : count} />
            <div className="flex items-center justify-between gap-2 text-[.75rem]">
              <span className="text-muted-foreground">种子 <span className="font-code text-foreground">{seed}</span></span>
              <button className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/14 px-3 hover:border-foreground/30 disabled:opacity-50" disabled={busy} onClick={() => { setSeed((value) => (value * 48271) % 2147483647); setCustom(null); resetRun(); }} type="button"><Shuffle className="size-3.5" />换一组</button>
            </div>
            <Segmented disabled={busy} label="构造" onChange={setConstruction} options={constructionOptions} value={construction} />
            <Segmented columns={2} disabled={busy} label="改进" onChange={setImprovement} options={improvementOptions} value={improvement} />
            {improvement === "annealing" ? <Slider disabled={busy} format={(t) => formatNumber(toIterations(t))} label="退火迭代次数" max={1} min={0} onChange={setAnnealT} step={0.01} value={annealT} /> : null}
            <Slider
              disabled={busy}
              format={(v) => `${v} ms`}
              hint="到达截止时间时，运行以 TIMED_OUT 结束，并返回到那一刻为止最好的路线。"
              label="截止时间"
              max={5000}
              min={50}
              onChange={setDeadline}
              step={50}
              value={deadline}
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.45fr)_minmax(19rem,1fr)]">
        <Panel meta={state.transitions.length ? <RunTimeline transitions={state.transitions} /> : "PENDING → ACCEPTED → RUNNING → 终态"} title="运行结果">
          {state.error ? <ErrorNotice error={state.error} /> : null}
          {state.cancelled ? <p className="border-b border-border/10 px-4 py-3 text-[.8125rem] text-muted-foreground">你取消了这次运行。浏览器断开事件流后，服务端会在下一个检查点（≤ 25 ms）停止计算并释放并发名额。</p> : null}
          {status === "TIMED_OUT" ? <p className="border-b border-border/10 bg-warning-subtle px-4 py-3 text-[.8125rem] text-warning-foreground">到达 {deadline} ms 截止时间：下面是截止前找到的最好路线（partial: true）。</p> : null}
          <div className="grid grid-cols-2 gap-px bg-border/10 min-[821px]:grid-cols-3">
            <Metric emphasis label="路线长度" value={output ? formatNumber(output.length) : liveLength !== undefined && drawnFor ? formatNumber(liveLength) : "—"} hint={output ? `初始 ${formatNumber(output.initialLength)}` : state.phase === "running" ? "实时：服务端当前最好结果" : undefined} />
            <Metric emphasis label="相比构造缩短" value={output ? formatPercent(output.improvement) : "—"} />
            <Metric emphasis label="距最优至多" value={output ? formatPercent(output.gap) : "—"} hint="以最小生成树为下界：没有路线能短于它" />
            <Metric label="评估的候选移动" value={output ? formatNumber(output.iterations) : state.progress && drawnFor ? formatNumber(state.progress.iterations) : "—"} hint={output ? `采纳 ${formatNumber(output.appliedMoves)} 次 · ${output.passes} 轮` : undefined} />
            <Metric label="服务端计算" unit="ms" value={output ? formatNumber(output.elapsedMs) : "—"} hint={state.run?.durationMs !== null && state.run ? `整个运行 ${state.run.durationMs} ms` : undefined} />
            <Metric label="停止原因" value={<span className="text-[.9375rem] tracking-normal">{output ? stopReasonLabels[output.stopReason] : "—"}</span>} />
          </div>
          <div className="border-t border-border/10 p-4">
            <LineChart
              label="最好路线长度随时间变化"
              series={output ? [{ label: "最好路线长度", points: output.convergence.map((sample) => ({ x: sample.at, y: sample.length })), className: "stroke-[hsl(var(--primary))]" }] : []}
              xLabel="横轴：毫秒"
              yFormat={(v) => formatNumber(v)}
            />
          </div>
          {compare ? <CompareTable compare={compare} /> : null}
        </Panel>

        <CodeTabs
          empty="点击「在服务端求解」后，这里会显示真实的请求、事件流与响应。"
          label="开发者视图"
          tabs={[
            { id: "request", label: "请求", code: state.request ? `POST ${ENDPOINT}\nAccept: text/event-stream\n\n${prettyJson(state.request)}` : `POST ${ENDPOINT}\n\n${prettyJson(requestBody)}` },
            { id: "events", label: "事件流", code: state.events.join("\n") },
            { id: "response", label: "响应", code: responseCode },
            { id: "curl", label: "curl", code: curlCommand(`${origin}${ENDPOINT}`, requestBody) },
          ]}
        />
      </div>
    </div>
  );
}

function ErrorNotice({ error }: { error: ClientError }) {
  if (error.kind === "network") return <p className="border-b border-border/10 bg-destructive-subtle px-4 py-3 text-[.8125rem] text-destructive-foreground">{error.message}</p>;
  const { body, status, retryAfter } = error;
  return (
    <div className="border-b border-border/10 bg-destructive-subtle px-4 py-3 text-[.8125rem] text-destructive-foreground" role="alert">
      <p><span className="font-code">HTTP {status} · {body?.code ?? "ERROR"}</span> — {body?.message ?? "请求失败。"}{status === 429 && retryAfter ? ` 请在 ${retryAfter} 秒后再试。` : ""}</p>
      {body?.issues?.length ? (
        <ul className="mt-1.5 space-y-0.5 font-code text-[.6875rem]">
          {body.issues.map((issue) => <li key={`${issue.path}${issue.message}`}>{issue.path}: {issue.message}</li>)}
        </ul>
      ) : null}
      {body?.requestId ? <p className="mt-1.5 font-code text-[.6875rem] opacity-70">requestId {body.requestId}</p> : null}
    </div>
  );
}

function CompareTable({ compare }: { compare: { running: boolean; rows: CompareRow[] } }) {
  const lengths = compare.rows.map((row) => row.length).filter((value): value is number => value !== undefined);
  const best = Math.min(...lengths);
  const worst = Math.max(...lengths);
  return (
    <div className="border-t border-border/10 p-4" aria-live="polite">
      <p className="text-[.75rem] text-muted-foreground">四种策略 · 同一点集与构造 · 每行都是一次真实的服务端运行{compare.running ? " · 运行中…" : ""}</p>
      <ul className="mt-3 space-y-2">
        {improvementOptions.map((option) => {
          const row = compare.rows.find((item) => item.improvement === option.value);
          const width = row?.length !== undefined && worst > 0 ? `${Math.max(6, (row.length / worst) * 100)}%` : "0%";
          return (
            <li className="grid grid-cols-[7.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-[.75rem]" key={option.value}>
              <span className="truncate">{option.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-foreground/10"><span className={cn("block h-full rounded-full transition-[width] duration-500", row?.length === best ? "bg-[hsl(var(--primary))]" : "bg-foreground/55")} style={{ width }} /></span>
              <span className="text-right font-code tabular-nums">{row ? (row.status === "ERROR" ? "失败" : row.length !== undefined ? formatNumber(row.length) : row.status) : "…"}</span>
            </li>
          );
        })}
      </ul>
      {compare.rows.some((row) => row.status === "ERROR") ? <p className="mt-2 text-[.75rem] text-destructive-foreground">{compare.rows.find((row) => row.status === "ERROR")?.message}</p> : null}
    </div>
  );
}
