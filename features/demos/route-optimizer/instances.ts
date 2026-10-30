/*
 * Seeded point sets for the route optimizer. The same (kind, count, seed) always yields
 * the same points in the browser and on the server, so a request can name an instance
 * instead of sending every coordinate.
 */
import type { Point } from "@/features/demos/route-optimizer/geometry";
import { prng } from "@/features/platform/sorting";

export const instanceKinds = ["uniform", "clustered", "circle", "grid"] as const;
export type InstanceKind = (typeof instanceKinds)[number];

export const instanceLabels: Record<InstanceKind, string> = {
  uniform: "均匀随机",
  clustered: "聚类城市",
  circle: "环形",
  grid: "网格",
};

/** Coordinates live in a 1000 × 1000 plane; generated points keep a margin. */
export const PLANE = 1000;
const MARGIN = 40;

const clamp = (value: number) => Math.min(PLANE - MARGIN, Math.max(MARGIN, value));
const tidy = (value: number) => Math.round(clamp(value) * 10) / 10;

function gaussian(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function shuffle<T>(items: T[], rand: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function generateInstance(kind: InstanceKind, count: number, seed: number): [number, number][] {
  const rand = prng((Math.imul(seed, 0x9e3779b1) + count) >>> 0);
  const span = PLANE - 2 * MARGIN;
  if (kind === "uniform") {
    return Array.from({ length: count }, () => [tidy(MARGIN + rand() * span), tidy(MARGIN + rand() * span)]);
  }
  if (kind === "clustered") {
    const clusters = 3 + Math.floor(rand() * 4);
    const centers = Array.from({ length: clusters }, () => [MARGIN + 90 + rand() * (span - 180), MARGIN + 90 + rand() * (span - 180)]);
    return Array.from({ length: count }, (_, i) => {
      const [cx, cy] = centers[i % clusters];
      return [tidy(cx + gaussian(rand) * 55), tidy(cy + gaussian(rand) * 55)];
    });
  }
  if (kind === "circle") {
    const points = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radius = 380 + gaussian(rand) * 5;
      return [tidy(500 + Math.cos(angle) * radius), tidy(500 + Math.sin(angle) * radius)] as [number, number];
    });
    return shuffle(points, rand);
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const gap = span / Math.max(cols, rows);
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    points.push([tidy(MARGIN + gap / 2 + c * gap + (rand() - 0.5) * gap * 0.18), tidy(MARGIN + gap / 2 + r * gap + (rand() - 0.5) * gap * 0.18)]);
  }
  return shuffle(points, rand);
}

export type { Point };
