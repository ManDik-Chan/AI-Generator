"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";

import { applyWindow, axisLabels, boundaryPoints, generateVolume, maskFraction, readSlice, VOLUME_SIZE, type Axis } from "@/features/platform/volume";
import { cn } from "@/lib/utils";

const N = VOLUME_SIZE;
const LIME: [number, number, number] = [233, 231, 120];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function Slider({ id, label, value, min, max, step = 1, onChange, format }: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange(value: number): void; format?: (value: number) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[.75rem]">
        <label className="text-[hsl(var(--paper)/.7)]" htmlFor={id}>{label}</label>
        <span className="font-code tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input className="mt-2 w-full accent-[hsl(var(--lime))]" id={id} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} />
    </div>
  );
}

/** One slice of the volume, window/level mapped, with an optional lime mask overlay. */
function SliceCanvas({ volume, axis, index, center, width, threshold, mask }: { volume: Float32Array; axis: Axis; index: number; center: number; width: number; threshold: number; mask: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const slice = readSlice(volume, N, axis, index);
    const image = context.createImageData(N, N);
    for (let i = 0; i < slice.length; i++) {
      const v = applyWindow(slice[i], center, width) * 255;
      let r = v, g = v, b = v;
      if (mask && slice[i] >= threshold) {
        r = r * 0.35 + LIME[0] * 0.65;
        g = g * 0.35 + LIME[1] * 0.65;
        b = b * 0.35 + LIME[2] * 0.65;
      }
      image.data[i * 4] = r;
      image.data[i * 4 + 1] = g;
      image.data[i * 4 + 2] = b;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [volume, axis, index, center, width, threshold, mask]);
  return <canvas aria-label={`${axisLabels[axis]}切片 ${index + 1} / ${N}`} className="block aspect-square w-full rounded-[3px] bg-black" height={N} ref={ref} role="img" width={N} />;
}

/** Boundary of the thresholded mask as a slowly rotating point cloud; drag to turn it. */
function PointCloud({ points: raw, playing }: { points: Float32Array; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Re-centre on the centroid so the shape turns around itself, not the volume corner.
  const { points, radius } = useMemo(() => {
    const count = raw.length / 3;
    if (!count) return { points: raw, radius: 1 };
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < raw.length; i += 3) { mx += raw[i]; my += raw[i + 1]; mz += raw[i + 2]; }
    mx /= count; my /= count; mz /= count;
    const out = new Float32Array(raw.length);
    let max = 0.05;
    for (let i = 0; i < raw.length; i += 3) {
      out[i] = raw[i] - mx; out[i + 1] = raw[i + 1] - my; out[i + 2] = raw[i + 2] - mz;
      max = Math.max(max, Math.hypot(out[i], out[i + 1], out[i + 2]));
    }
    return { points: out, radius: max };
  }, [raw]);
  const angle = useRef({ y: 0.6, x: -0.35 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const visible = useRef(true);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    let idle: number | undefined;
    let last = performance.now();
    const draw = (now: number) => {
      // Off screen (or inside a hidden tab panel): poll slowly instead of drawing every frame.
      if (!visible.current) {
        idle = window.setTimeout(() => { last = performance.now(); frame = window.requestAnimationFrame(draw); }, 400);
        return;
      }
      const dt = Math.min(64, now - last);
      last = now;
      if (playing && !drag.current && visible.current) angle.current.y += dt * 0.00035;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const size = canvas.clientWidth;
      if (canvas.width !== Math.round(size * ratio)) {
        canvas.width = Math.round(size * ratio);
        canvas.height = Math.round(size * ratio);
      }
      const w = canvas.width;
      context.clearRect(0, 0, w, w);
      const cy = Math.cos(angle.current.y), sy = Math.sin(angle.current.y);
      const cx = Math.cos(angle.current.x), sx = Math.sin(angle.current.x);
      // Fit the cloud: radius maps to ~42% of the canvas after the mean perspective factor.
      const scale = (w * 0.42) / radius / 0.85;
      for (let i = 0; i < points.length; i += 3) {
        const x0 = points[i], y0 = points[i + 1], z0 = points[i + 2];
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y1 = y0 * cx - z1 * sx;
        const z2 = y0 * sx + z1 * cx;
        const depth = 1 / (2.6 - z2);
        const px = w / 2 + x1 * scale * depth * 2.2;
        const py = w / 2 + y1 * scale * depth * 2.2;
        const shade = Math.max(0.15, Math.min(1, (z2 + 1.2) / 2.2));
        context.fillStyle = `rgba(${Math.round(150 + 83 * shade)}, ${Math.round(150 + 81 * shade)}, ${Math.round(110 + 10 * shade)}, ${0.25 + shade * 0.7})`;
        const r = ratio * (0.7 + shade * 0.9);
        context.fillRect(px - r / 2, py - r / 2, r, r);
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(idle);
    };
  }, [points, radius, playing]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    angle.current.y += (event.clientX - drag.current.x) * 0.01;
    angle.current.x = Math.max(-1.3, Math.min(1.3, angle.current.x + (event.clientY - drag.current.y) * 0.01));
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const end = () => { drag.current = null; };

  return (
    <canvas
      aria-label={`三维点云预览，${Math.round(points.length / 3)} 个边界点，可拖动旋转`}
      className="block aspect-square w-full cursor-grab touch-none active:cursor-grabbing"
      onPointerCancel={end}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      ref={ref}
      role="img"
    />
  );
}

export function VolumeLab() {
  const reduced = useReducedMotion();
  const [volume, setVolume] = useState<Float32Array | null>(null);
  const [axis, setAxis] = useState<Axis>("axial");
  const [index, setIndex] = useState(23);
  const [center, setCenter] = useState(0.5);
  const [width, setWidth] = useState(0.9);
  const [threshold, setThreshold] = useState(0.42);
  const [mask, setMask] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [cloudThreshold, setCloudThreshold] = useState(0.42);

  useEffect(() => setVolume(generateVolume()), []);
  useEffect(() => setPlaying(!reduced), [reduced]);
  useEffect(() => {
    const id = window.setTimeout(() => setCloudThreshold(threshold), 180);
    return () => window.clearTimeout(id);
  }, [threshold]);

  const points = useMemo(() => (volume ? boundaryPoints(volume, N, cloudThreshold, cloudThreshold < 0.38 ? 4 : 2) : new Float32Array()), [volume, cloudThreshold]);
  const fraction = useMemo(() => (volume ? maskFraction(volume, threshold) : 0), [volume, threshold]);

  return (
    <div className="overflow-hidden rounded-card bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--paper)/.12)] px-4 py-3">
        <p className="text-[.8125rem] font-medium">实验室 · 三平面切片与三维预览</p>
        <p className="flex items-center gap-2 text-[.6875rem] text-[hsl(var(--paper)/.65)]"><span className="size-1.5 rounded-full bg-lime" />合成体数据 64³ · 程序生成 · 非临床 · 不上传任何内容</p>
      </div>
      {volume ? (
        <div className="grid gap-px bg-[hsl(var(--paper)/.1)] min-[1024px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(15rem,.8fr)]">
          <div className="bg-[hsl(var(--ink))] p-4">
            <div aria-label="切片方向" className="mb-3 flex gap-1" role="group">
              {(Object.keys(axisLabels) as Axis[]).map((key) => (
                <button aria-pressed={axis === key} className={cn("h-8 rounded-full px-3 text-[.75rem] font-medium transition-colors duration-300", axis === key ? "bg-[hsl(var(--paper))] text-[hsl(var(--ink))]" : "text-[hsl(var(--paper)/.7)] hover:bg-[hsl(var(--paper)/.1)]")} key={key} onClick={() => setAxis(key)} type="button">{axisLabels[key]}</button>
              ))}
            </div>
            <SliceCanvas axis={axis} center={center} index={index} mask={mask} threshold={threshold} volume={volume} width={width} />
            <div className="mt-4">
              <Slider format={(value) => `${value + 1} / ${N}`} id="vl-slice" label="切片位置" max={N - 1} min={0} onChange={setIndex} value={index} />
            </div>
          </div>
          <div className="relative bg-[hsl(var(--ink))] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[.75rem] text-[hsl(var(--paper)/.7)]">掩膜边界 · 点云</p>
              <button aria-label={playing ? "暂停旋转" : "继续旋转"} className="grid size-8 place-items-center rounded-full text-[hsl(var(--paper)/.8)] hover:bg-[hsl(var(--paper)/.1)]" onClick={() => setPlaying((value) => !value)} type="button">
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
            </div>
            <PointCloud playing={playing} points={points} />
            <p className="mt-3 text-[.6875rem] text-[hsl(var(--paper)/.55)]">拖动旋转 · {Math.round(points.length / 3).toLocaleString()} 个边界点</p>
          </div>
          <div className="space-y-5 bg-[hsl(var(--ink))] p-4">
            <Slider format={(value) => value.toFixed(2)} id="vl-center" label="窗位" max={1} min={0} onChange={setCenter} step={0.01} value={center} />
            <Slider format={(value) => value.toFixed(2)} id="vl-width" label="窗宽" max={1.5} min={0.1} onChange={setWidth} step={0.01} value={width} />
            <Slider format={(value) => value.toFixed(2)} id="vl-threshold" label="分割阈值" max={0.95} min={0.2} onChange={setThreshold} step={0.01} value={threshold} />
            <label className="flex cursor-pointer items-center justify-between gap-3 text-[.75rem]">
              <span className="text-[hsl(var(--paper)/.7)]">叠加掩膜</span>
              <input checked={mask} className="size-4 accent-[hsl(var(--lime))]" onChange={(event) => setMask(event.target.checked)} type="checkbox" />
            </label>
            <dl className="border-t border-[hsl(var(--paper)/.12)] pt-4 text-[.75rem]">
              <div className="flex justify-between gap-3 py-1"><dt className="text-[hsl(var(--paper)/.6)]">掩膜体素占比</dt><dd className="font-code tabular-nums">{(fraction * 100).toFixed(2)}%</dd></div>
              <div className="flex justify-between gap-3 py-1"><dt className="text-[hsl(var(--paper)/.6)]">体数据尺寸</dt><dd className="font-code">64 × 64 × 64</dd></div>
            </dl>
            <p className="text-[.6875rem] leading-5 text-[hsl(var(--paper)/.5)]">读数只描述这份合成样例，不是模型精度或任何医学指标。</p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[20rem] place-items-center text-[.8125rem] text-[hsl(var(--paper)/.6)]">正在生成合成体数据…</div>
      )}
    </div>
  );
}
