/*
 * Sorting experiment used by the sample "排序算法对照实验" project. Every number shown
 * on its page is produced by these functions, in the visitor's browser or at build time;
 * nothing is typed in by hand.
 */

export type Distribution = "random" | "nearly-sorted" | "reversed" | "few-unique";
export type Algorithm = "insertion" | "merge" | "quick";

export const distributions: { key: Distribution; label: string }[] = [
  { key: "random", label: "随机" },
  { key: "nearly-sorted", label: "近乎有序" },
  { key: "reversed", label: "逆序" },
  { key: "few-unique", label: "大量重复" },
];

export const algorithms: { key: Algorithm; label: string; complexity: string }[] = [
  { key: "insertion", label: "插入排序", complexity: "O(n²)" },
  { key: "merge", label: "归并排序", complexity: "O(n log n)" },
  { key: "quick", label: "快速排序（三数取中）", complexity: "O(n log n) 平均" },
];

/** Small deterministic PRNG (mulberry32) so a seed always yields the same input. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeInput(distribution: Distribution, n: number, seed: number): number[] {
  const rand = prng(seed);
  const values = Array.from({ length: n }, (_, i) => i + 1);
  if (distribution === "reversed") return values.reverse();
  if (distribution === "few-unique") return values.map(() => 1 + Math.floor(rand() * 4));
  if (distribution === "nearly-sorted") {
    const out = [...values];
    const swaps = Math.max(1, Math.floor(n / 16));
    for (let s = 0; s < swaps; s++) {
      const i = Math.floor(rand() * (n - 1));
      [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
    return out;
  }
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

/** One visual step: the indices compared or written and the array after the step. */
export interface SortStep {
  a: number;
  b: number;
  kind: "compare" | "write";
  snapshot: number[];
}

export interface SortRun {
  sorted: number[];
  comparisons: number;
  steps: SortStep[];
}

/** Run an algorithm and count comparisons. Steps are recorded only when `record` is true. */
export function runSort(algorithm: Algorithm, input: readonly number[], record = false, maxSteps = 4000): SortRun {
  const arr = [...input];
  const steps: SortStep[] = [];
  let comparisons = 0;
  const log = (a: number, b: number, kind: SortStep["kind"]) => {
    if (record && steps.length < maxSteps) steps.push({ a, b, kind, snapshot: [...arr] });
  };
  const less = (i: number, j: number, x: number, y: number) => {
    comparisons += 1;
    log(i, j, "compare");
    return x < y;
  };

  if (algorithm === "insertion") {
    for (let i = 1; i < arr.length; i++) {
      const value = arr[i];
      let j = i - 1;
      while (j >= 0 && less(j, i, value, arr[j])) {
        arr[j + 1] = arr[j];
        log(j + 1, j, "write");
        j -= 1;
      }
      arr[j + 1] = value;
      log(j + 1, i, "write");
    }
  } else if (algorithm === "merge") {
    const merge = (lo: number, mid: number, hi: number) => {
      const left = arr.slice(lo, mid);
      const right = arr.slice(mid, hi);
      let i = 0;
      let j = 0;
      let k = lo;
      while (i < left.length && j < right.length) {
        if (!less(lo + i, mid + j, right[j], left[i])) arr[k++] = left[i++];
        else arr[k++] = right[j++];
        log(k - 1, k - 1, "write");
      }
      while (i < left.length) { arr[k++] = left[i++]; log(k - 1, k - 1, "write"); }
      while (j < right.length) { arr[k++] = right[j++]; log(k - 1, k - 1, "write"); }
    };
    const sort = (lo: number, hi: number) => {
      if (hi - lo < 2) return;
      const mid = (lo + hi) >> 1;
      sort(lo, mid);
      sort(mid, hi);
      merge(lo, mid, hi);
    };
    sort(0, arr.length);
  } else {
    const swap = (i: number, j: number) => {
      [arr[i], arr[j]] = [arr[j], arr[i]];
      log(i, j, "write");
    };
    const sort = (lo: number, hi: number) => {
      if (hi - lo < 1) return;
      const mid = (lo + hi) >> 1;
      if (less(mid, lo, arr[mid], arr[lo])) swap(mid, lo);
      if (less(hi, lo, arr[hi], arr[lo])) swap(hi, lo);
      if (less(hi, mid, arr[hi], arr[mid])) swap(hi, mid);
      const pivot = arr[mid];
      let i = lo;
      let j = hi;
      while (i <= j) {
        while (less(i, mid, arr[i], pivot)) i += 1;
        while (less(mid, j, pivot, arr[j])) j -= 1;
        if (i <= j) {
          swap(i, j);
          i += 1;
          j -= 1;
        }
      }
      sort(lo, j);
      sort(i, hi);
    };
    sort(0, arr.length - 1);
  }

  return { sorted: arr, comparisons, steps };
}

/** Comparison counts for every algorithm × distribution (the benchmark table). */
export function comparisonTable(n: number, seed: number) {
  return distributions.map((distribution) => ({
    distribution,
    counts: algorithms.map((algorithm) => runSort(algorithm.key, makeInput(distribution.key, n, seed)).comparisons),
  }));
}
