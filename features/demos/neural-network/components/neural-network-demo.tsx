"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Play, Plus, RotateCcw, Shuffle, Square } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { CodeTabs, LineChart, Metric, Panel, RunTimeline, Segmented, Slider } from "@/features/demos/components/ui";
import { formatPercent, prettyJson } from "@/features/demos/components/format";
import { datasetKinds, datasetLabels, type DatasetKind, type FeatureSet } from "@/features/demos/neural-network/datasets";
import { isRunActive } from "@/features/demos/neural-network/host-state";
import type { Activation, OptimizerKind } from "@/features/demos/neural-network/mlp";
import { WORKER_PROTOCOL, type SessionConfig, type TrainInput } from "@/features/demos/neural-network/protocol";
import { useNeuralTrainer } from "@/features/demos/neural-network/use-neural-trainer";
import { runStatusMeta } from "@/features/platform/labels";
import { cn } from "@/lib/utils";

/* Class colours: class 0 warm (ember), class 1 cool (forest teal). */
const WARM: [number, number, number] = [205, 104, 64];
const COOL: [number, number, number] = [28, 135, 112];

const batchOptions = [1, 8, 16, 32, 64, 256];
const epochOptions = [50, 200, 500, 2000, 5000];
const l2Options = [0, 0.0001, 0.001, 0.01, 0.1];

/** Learning rate on a log slider: 10^-4 … 3. */
const toRate = (t: number) => Number((10 ** (-4 + t * (Math.log10(3) + 4))).toPrecision(2));
const fromRate = (lr: number) => (Math.log10(lr) + 4) / (Math.log10(3) + 4);

function hslToRgb(triple: string): [number, number, number] {
  const [h, s, l] = triple.trim().split(/\s+/).map((part) => Number.parseFloat(part));
  if (![h, s, l].every(Number.isFinite)) return [240, 236, 230];
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function BoundaryCanvas({ grid, gridSize, domain, points, labels, test, label }: { grid: number[] | null; gridSize: number; domain: number; points: number[]; labels: number[]; test: number[]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const testSet = useMemo(() => new Set(test), [test]);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const size = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) || 480;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const base = hslToRgb(getComputedStyle(canvas).getPropertyValue("--background"));
    context.clearRect(0, 0, size, size);
    if (grid && grid.length === gridSize * gridSize) {
      const tile = document.createElement("canvas");
      tile.width = gridSize;
      tile.height = gridSize;
      const tileContext = tile.getContext("2d");
      if (tileContext) {
        const image = tileContext.createImageData(gridSize, gridSize);
        for (let i = 0; i < grid.length; i++) {
          const p = grid[i];
          const target = p >= 0.5 ? COOL : WARM;
          const strength = Math.min(1, Math.abs(p - 0.5) * 2) * 0.62;
          image.data[i * 4] = base[0] + (target[0] - base[0]) * strength;
          image.data[i * 4 + 1] = base[1] + (target[1] - base[1]) * strength;
          image.data[i * 4 + 2] = base[2] + (target[2] - base[2]) * strength;
          image.data[i * 4 + 3] = 255;
        }
        tileContext.putImageData(image, 0, 0);
        context.imageSmoothingEnabled = true;
        context.drawImage(tile, 0, 0, size, size);
      }
    } else {
      context.fillStyle = `rgb(${base.join(",")})`;
      context.fillRect(0, 0, size, size);
    }
    const scale = size / (domain * 2);
    const radius = Math.max(2.5, size / 150);
    for (let i = 0; i < labels.length; i++) {
      const x = (points[i * 2] + domain) * scale;
      const y = (domain - points[i * 2 + 1]) * scale;
      const color = labels[i] === 1 ? COOL : WARM;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      if (testSet.has(i)) {
        context.lineWidth = Math.max(1.5, radius * 0.55);
        context.strokeStyle = `rgb(${color.join(",")})`;
        context.fillStyle = `rgb(${base.join(",")})`;
        context.fill();
        context.stroke();
      } else {
        context.fillStyle = `rgb(${color.join(",")})`;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = "rgba(255,255,255,.7)";
        context.stroke();
      }
    }
  }, [grid, gridSize, domain, points, labels, testSet]);

  return <canvas aria-label={label} className="block aspect-square w-full rounded-[3px]" ref={ref} role="img" />;
}

function NetworkDiagram({ sizes, weights, featureLabels }: { sizes: number[]; weights: number[][] | null; featureLabels: string[] }) {
  const width = 520;
  const height = 230;
  const columns = sizes.length;
  const x = (layer: number) => 36 + (layer * (width - 72)) / Math.max(1, columns - 1);
  const y = (layer: number, index: number) => {
    const count = sizes[layer];
    const gap = Math.min(26, (height - 30) / Math.max(1, count));
    return height / 2 + (index - (count - 1) / 2) * gap;
  };
  const max = Math.max(1e-6, ...(weights ?? []).flat().map(Math.abs));
  return (
    <svg aria-label={`网络结构 ${sizes.join("-")}，连线粗细表示权重大小`} className="block h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
      {weights?.map((layerWeights, l) =>
        layerWeights.map((w, k) => {
          const cols = sizes[l];
          const r = Math.floor(k / cols);
          const c = k % cols;
          return (
            <line
              key={`${l}-${k}`}
              stroke={`rgb(${(w >= 0 ? COOL : WARM).join(",")})`}
              strokeOpacity={0.25 + 0.75 * (Math.abs(w) / max)}
              strokeWidth={0.6 + 3.2 * (Math.abs(w) / max)}
              x1={x(l)}
              x2={x(l + 1)}
              y1={y(l, c)}
              y2={y(l + 1, r)}
            />
          );
        }),
      )}
      {sizes.map((count, l) =>
        Array.from({ length: count }, (_, i) => (
          <g key={`${l}-${i}`}>
            <circle className={l === 0 || l === columns - 1 ? "fill-foreground" : "fill-background stroke-foreground"} cx={x(l)} cy={y(l, i)} r={l === columns - 1 ? 8 : 6} strokeWidth={1.5} />
            {l === 0 ? <text className="fill-muted-foreground font-code text-[11px]" dominantBaseline="middle" textAnchor="end" x={x(l) - 12} y={y(l, i)}>{featureLabels[i]}</text> : null}
          </g>
        )),
      )}
      <text className="fill-muted-foreground font-code text-[11px]" textAnchor="middle" x={x(columns - 1)} y={height - 4}>P(类 1)</text>
    </svg>
  );
}

export function NeuralNetworkDemo() {
  const { state, configure, start, cancel, reset } = useNeuralTrainer();
  const [kind, setKind] = useState<DatasetKind>("spiral");
  const [samples, setSamples] = useState(300);
  const [noise, setNoise] = useState(0.1);
  const [testRatio, setTestRatio] = useState(0.25);
  const [dataSeed, setDataSeed] = useState(4);
  const [features, setFeatures] = useState<FeatureSet>("raw");
  const [hidden, setHidden] = useState<number[]>([8, 8, 6]);
  const [activation, setActivation] = useState<Activation>("tanh");
  const [weightSeed, setWeightSeed] = useState(11);
  const [optimizer, setOptimizer] = useState<OptimizerKind>("adam");
  const [rateT, setRateT] = useState(fromRate(0.03));
  const [batchSize, setBatchSize] = useState(16);
  const [l2, setL2] = useState(0.0001);
  const [epochs, setEpochs] = useState(500);

  const config: SessionConfig = useMemo(
    () => ({ dataset: { kind, samples, noise, testRatio, seed: dataSeed }, network: { hidden, activation, features }, seed: weightSeed }),
    [kind, samples, noise, testRatio, dataSeed, hidden, activation, features, weightSeed],
  );
  const trainInput: TrainInput = { epochs, learningRate: toRate(rateT), batchSize, l2, optimizer };

  // Reconfigure (new data / new network) shortly after the controls settle.
  useEffect(() => {
    const id = window.setTimeout(() => configure(config), 180);
    return () => window.clearTimeout(id);
  }, [config, configure]);

  const session = state.session;
  const active = isRunActive(state.run);
  const metrics = state.metrics;
  const status = state.run?.status ?? null;

  const history = state.history;
  const lossSeries = [
    { label: "训练损失", points: history.map((p) => ({ x: p.epoch, y: p.trainLoss })), className: "stroke-foreground" },
    { label: "测试损失", points: history.map((p) => ({ x: p.epoch, y: p.testLoss })), className: "stroke-[hsl(var(--primary))]" },
  ];

  const setLayer = (index: number, delta: number) => setHidden((layers) => layers.map((value, i) => (i === index ? Math.min(8, Math.max(1, value + delta)) : value)));

  return (
    <div className="space-y-0.5">
      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(19rem,1fr)]">
        <Panel
          meta={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-code">{state.transport === "worker" ? "Web Worker" : state.transport === "main-thread" ? "主线程（降级）" : "启动中…"}</span>
              {status ? <ToneBadge dot tone={runStatusMeta[status].tone}>{runStatusMeta[status].label}</ToneBadge> : null}
            </span>
          }
          title="决策边界"
        >
          <div className="p-3 min-[640px]:p-4">
            {session ? (
              <BoundaryCanvas domain={session.domain} grid={state.grid} gridSize={session.gridSize} label={`${datasetLabels[kind]}数据集的决策边界，第 ${metrics?.epoch ?? 0} 轮`} labels={session.labels} points={session.points} test={session.test} />
            ) : (
              <div className="grid aspect-square w-full place-items-center rounded-[3px] bg-background text-[.8125rem] text-muted-foreground">正在你的浏览器里准备数据与网络…</div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {active ? (
                <Button onClick={() => state.run && cancel(state.run.id)} size="sm" variant="outline"><Square className="size-3.5" />停止</Button>
              ) : (
                <Button disabled={!session} onClick={() => start(trainInput)} size="sm"><Play className="size-3.5" />训练 {epochs} 轮</Button>
              )}
              <Button disabled={!session} onClick={() => { const next = (weightSeed * 48271) % 2147483647; setWeightSeed(next); reset(next); }} size="sm" variant="ghost"><RotateCcw className="size-3.5" />重新初始化权重</Button>
              <span className="ml-auto flex items-center gap-3 text-[.6875rem] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: `rgb(${WARM.join(",")})` }} />类 0</span>
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: `rgb(${COOL.join(",")})` }} />类 1</span>
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-full border-2 border-foreground/60" />测试集</span>
              </span>
            </div>
            {state.transportNote ? <p className="mt-3 rounded-control bg-warning-subtle px-3 py-2 text-[.75rem] text-warning-foreground">{state.transportNote}</p> : null}
            {state.notice ? <p className="mt-3 rounded-control bg-destructive-subtle px-3 py-2 text-[.75rem] text-destructive-foreground">{state.notice}</p> : null}
            {state.run?.error ? (
              <p className={cn("mt-3 rounded-control px-3 py-2 text-[.75rem]", state.run.status === "CANCELLED" ? "bg-surface-muted text-muted-foreground" : "bg-warning-subtle text-warning-foreground")} role={state.run.status === "FAILED" ? "alert" : undefined}>
                <span className="font-code">{state.run.error.code}</span> · {state.run.error.message}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel meta={active ? "训练中：数据与网络的改动会取消当前运行" : "改动数据或网络会重新初始化"} title="参数">
          <div className="space-y-5 p-4">
            <Segmented columns={3} label="数据集" onChange={setKind} options={datasetKinds.map((value) => ({ value, label: datasetLabels[value] }))} value={kind} />
            <div className="grid gap-4 min-[521px]:grid-cols-2">
              <Slider label="样本数" max={800} min={40} onChange={setSamples} step={20} value={samples} />
              <Slider format={(v) => v.toFixed(2)} label="噪声" max={0.6} min={0} onChange={setNoise} step={0.05} value={noise} />
              <Slider format={(v) => formatPercent(v, 0)} label="测试集比例" max={0.5} min={0.1} onChange={setTestRatio} step={0.05} value={testRatio} />
              <div className="flex items-end">
                <button className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/14 px-3 text-[.75rem] hover:border-foreground/30" onClick={() => setDataSeed((value) => (value * 16807) % 2147483647)} type="button"><Shuffle className="size-3.5" />换一组数据</button>
              </div>
            </div>
            <Segmented label="输入特征" onChange={setFeatures} options={[{ value: "raw", label: "x, y" }, { value: "quadratic", label: "x, y, x², y², xy" }]} value={features} />
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[.75rem] text-muted-foreground">隐藏层 · {hidden.length ? hidden.join(" → ") : "无（逻辑回归）"}</p>
                <div className="flex gap-1">
                  <button aria-label="删除最后一层隐藏层" className="grid size-8 place-items-center rounded-full border border-border/14 hover:border-foreground/30 disabled:opacity-40" disabled={!hidden.length} onClick={() => setHidden((layers) => layers.slice(0, -1))} type="button"><Minus className="size-3.5" /></button>
                  <button aria-label="添加一层隐藏层" className="grid size-8 place-items-center rounded-full border border-border/14 hover:border-foreground/30 disabled:opacity-40" disabled={hidden.length >= 4} onClick={() => setHidden((layers) => [...layers, 4])} type="button"><Plus className="size-3.5" /></button>
                </div>
              </div>
              {hidden.length ? (
                <ul className="mt-2 grid grid-cols-2 gap-1 min-[521px]:grid-cols-4">
                  {hidden.map((value, index) => (
                    <li className="flex items-center justify-between rounded-full bg-surface-raised px-1 py-1 shadow-[inset_0_0_0_1px_hsl(var(--border)/.08)]" key={index}>
                      <button aria-label={`第 ${index + 1} 层减少一个神经元`} className="grid size-7 place-items-center rounded-full hover:bg-surface-muted disabled:opacity-40" disabled={value <= 1} onClick={() => setLayer(index, -1)} type="button"><Minus className="size-3" /></button>
                      <span className="font-code text-[.75rem] tabular-nums">{value}</span>
                      <button aria-label={`第 ${index + 1} 层增加一个神经元`} className="grid size-7 place-items-center rounded-full hover:bg-surface-muted disabled:opacity-40" disabled={value >= 8} onClick={() => setLayer(index, 1)} type="button"><Plus className="size-3" /></button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Segmented label="激活函数" onChange={setActivation} options={[{ value: "tanh", label: "tanh" }, { value: "relu", label: "ReLU" }, { value: "sigmoid", label: "sigmoid" }]} value={activation} />
            <div className="border-t border-border/10 pt-4">
              <p className="mb-3 text-[.6875rem] text-muted-foreground">以下训练参数在下一次点击「训练」时生效，并从当前权重继续。</p>
              <div className="space-y-4">
                <Segmented label="优化器" onChange={setOptimizer} options={[{ value: "sgd", label: "SGD" }, { value: "momentum", label: "Momentum" }, { value: "adam", label: "Adam" }]} value={optimizer} />
                <Slider format={(t) => String(toRate(t))} label="学习率" max={1} min={0} onChange={setRateT} step={0.01} value={rateT} />
                <Segmented label="批大小" onChange={(v) => setBatchSize(Number(v))} options={batchOptions.map((value) => ({ value: String(value), label: String(value) }))} value={String(batchSize)} />
                <Segmented label="L2 正则" onChange={(v) => setL2(Number(v))} options={l2Options.map((value) => ({ value: String(value), label: value === 0 ? "无" : String(value) }))} value={String(l2)} />
                <Segmented label="每次训练轮数" onChange={(v) => setEpochs(Number(v))} options={epochOptions.map((value) => ({ value: String(value), label: String(value) }))} value={String(epochs)} />
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(19rem,1fr)]">
        <Panel meta={state.run ? <RunTimeline transitions={state.run.transitions} /> : "PENDING → ACCEPTED → RUNNING → 终态"} title="训练过程">
          <div className="grid grid-cols-2 gap-px bg-border/10 min-[821px]:grid-cols-3">
            <Metric emphasis label="已训练轮数" value={metrics?.epoch ?? 0} hint={session ? `${session.parameterCount} 个参数 · ${session.train.length} 训练 / ${session.test.length} 测试` : undefined} />
            <Metric emphasis label="测试准确率" value={metrics ? formatPercent(metrics.testAccuracy) : "—"} hint={metrics ? `训练集 ${formatPercent(metrics.trainAccuracy)}` : undefined} />
            <Metric emphasis label="测试损失" value={metrics ? metrics.testLoss.toFixed(3) : "—"} hint={metrics ? `训练集 ${metrics.trainLoss.toFixed(3)}` : undefined} />
          </div>
          <div className="border-t border-border/10 p-4">
            <LineChart label="训练损失与测试损失随轮数变化" series={lossSeries} xLabel="横轴：轮数" yFormat={(v) => v.toFixed(3)} />
          </div>
          <div className="border-t border-border/10 p-4">
            <p className="mb-2 text-[.75rem] text-muted-foreground">网络结构 · 连线颜色为权重正负，粗细为大小</p>
            {session ? <NetworkDiagram featureLabels={session.featureLabels} sizes={session.sizes} weights={state.weights} /> : null}
          </div>
        </Panel>

        <CodeTabs
          empty="页面与 Worker 之间的消息会显示在这里。"
          label="开发者视图"
          tabs={[
            { id: "log", label: "消息日志", code: [...state.log, ...(state.progressCount ? [`（另有 ${state.progressCount} 条 run.progress 未逐条列出）`] : [])].join("\n") },
            { id: "configure", label: "session.configure", code: prettyJson({ protocol: WORKER_PROTOCOL, type: "session.configure", config }) },
            { id: "start", label: "run.start", code: prettyJson({ protocol: WORKER_PROTOCOL, type: "run.start", runId: state.run?.id ?? "run_nn_…", input: trainInput }) },
            { id: "progress", label: "run.progress", code: metrics ? prettyJson({ protocol: WORKER_PROTOCOL, type: "run.progress", runId: state.run?.id ?? "—", metrics, grid: state.grid, weights: state.weights }) : "" },
          ]}
        />
      </div>
    </div>
  );
}
