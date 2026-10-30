/*
 * Synthetic volume for the research showcase lab. The data is generated from a fixed
 * seed in the browser: a soft "body" ellipsoid, two inner structures and one bright
 * target blob, plus noise. It resembles no real anatomy and contains no patient data.
 */
import { prng } from "@/features/platform/sorting";

export const VOLUME_SIZE = 64;

interface Blob {
  c: [number, number, number];
  r: [number, number, number];
  v: number;
}

const blobs: Blob[] = [
  { c: [0.5, 0.5, 0.5], r: [0.38, 0.3, 0.42], v: 0.32 },
  { c: [0.38, 0.46, 0.46], r: [0.11, 0.14, 0.17], v: 0.52 },
  { c: [0.63, 0.47, 0.52], r: [0.12, 0.12, 0.15], v: 0.48 },
  // the bright target that segmentation should find
  { c: [0.58, 0.58, 0.36], r: [0.075, 0.065, 0.085], v: 0.9 },
];

export function generateVolume(n = VOLUME_SIZE, seed = 2026): Float32Array {
  const rand = prng(seed);
  const out = new Float32Array(n * n * n);
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const p = [(x + 0.5) / n, (y + 0.5) / n, (z + 0.5) / n];
        let value = 0.04;
        for (const blob of blobs) {
          const d = Math.hypot((p[0] - blob.c[0]) / blob.r[0], (p[1] - blob.c[1]) / blob.r[1], (p[2] - blob.c[2]) / blob.r[2]);
          // soft edge: full inside, smooth falloff across the boundary
          const w = d < 0.85 ? 1 : d > 1.15 ? 0 : 1 - (d - 0.85) / 0.3;
          value = Math.max(value, blob.v * w);
        }
        value += (rand() - 0.5) * 0.08;
        out[(z * n + y) * n + x] = Math.min(1, Math.max(0, value));
      }
    }
  }
  return out;
}

export type Axis = "axial" | "coronal" | "sagittal";

export const axisLabels: Record<Axis, string> = { axial: "轴位", coronal: "冠状位", sagittal: "矢状位" };

/** Read one slice as a flat n×n array (row-major, top row first). */
export function readSlice(volume: Float32Array, n: number, axis: Axis, index: number): Float32Array {
  const out = new Float32Array(n * n);
  const i = Math.min(n - 1, Math.max(0, Math.round(index)));
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      let x = col;
      let y = row;
      let z = i;
      if (axis === "coronal") { x = col; y = i; z = n - 1 - row; }
      if (axis === "sagittal") { x = i; y = col; z = n - 1 - row; }
      out[row * n + col] = volume[(z * n + y) * n + x];
    }
  }
  return out;
}

/** Window / level mapping used by medical viewers: value → 0..1 display intensity. */
export function applyWindow(value: number, center: number, width: number) {
  const lo = center - width / 2;
  return Math.min(1, Math.max(0, (value - lo) / Math.max(1e-6, width)));
}

/**
 * Boundary voxels of the thresholded mask, as points in -1..1 space.
 * Every `stride`-th boundary voxel is kept to bound the point count.
 */
export function boundaryPoints(volume: Float32Array, n: number, threshold: number, stride = 2): Float32Array {
  const points: number[] = [];
  const at = (x: number, y: number, z: number) => volume[(z * n + y) * n + x];
  let counter = 0;
  for (let z = 1; z < n - 1; z++) {
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        if (at(x, y, z) < threshold) continue;
        const edge = at(x - 1, y, z) < threshold || at(x + 1, y, z) < threshold || at(x, y - 1, z) < threshold
          || at(x, y + 1, z) < threshold || at(x, y, z - 1) < threshold || at(x, y, z + 1) < threshold;
        if (!edge) continue;
        counter += 1;
        if (counter % stride !== 0) continue;
        points.push((x / (n - 1)) * 2 - 1, (y / (n - 1)) * 2 - 1, (z / (n - 1)) * 2 - 1);
      }
    }
  }
  return Float32Array.from(points);
}

/** Fraction of voxels at or above the threshold (shown as a live readout, not a metric). */
export function maskFraction(volume: Float32Array, threshold: number) {
  let count = 0;
  for (let i = 0; i < volume.length; i++) if (volume[i] >= threshold) count += 1;
  return count / volume.length;
}
