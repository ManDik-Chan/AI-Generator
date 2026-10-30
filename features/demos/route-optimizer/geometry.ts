/*
 * Euclidean geometry for the route optimizer: a dense distance matrix, tour length and
 * a minimum-spanning-tree lower bound. Removing any edge from a closed tour leaves a
 * spanning path, which is at least as long as the MST, so MST ≤ optimal tour length.
 */

export type Point = readonly [number, number];

export function distanceMatrix(points: readonly Point[]): Float64Array {
  const n = points.length;
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const [xi, yi] = points[i];
    for (let j = i + 1; j < n; j++) {
      const dx = xi - points[j][0];
      const dy = yi - points[j][1];
      const value = Math.sqrt(dx * dx + dy * dy);
      d[i * n + j] = value;
      d[j * n + i] = value;
    }
  }
  return d;
}

/** Length of the closed tour (returns to its first city). */
export function tourLength(tour: ArrayLike<number>, d: Float64Array, n: number): number {
  let total = 0;
  for (let k = 0; k < tour.length; k++) {
    const a = tour[k];
    const b = tour[(k + 1) % tour.length];
    total += d[a * n + b];
  }
  return total;
}

/** Prim's algorithm on the complete graph, O(n²). */
export function mstWeight(d: Float64Array, n: number): number {
  if (n < 2) return 0;
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  best[0] = 0;
  let total = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    let min = Infinity;
    for (let v = 0; v < n; v++) {
      if (!inTree[v] && best[v] < min) {
        min = best[v];
        u = v;
      }
    }
    if (u < 0) break;
    inTree[u] = 1;
    total += min;
    for (let v = 0; v < n; v++) {
      const w = d[u * n + v];
      if (!inTree[v] && w < best[v]) best[v] = w;
    }
  }
  return total;
}

/** True when `tour` visits every index 0..n-1 exactly once. */
export function isPermutation(tour: ArrayLike<number>, n: number) {
  if (tour.length !== n) return false;
  const seen = new Uint8Array(n);
  for (let k = 0; k < tour.length; k++) {
    const v = tour[k];
    if (!Number.isInteger(v) || v < 0 || v >= n || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}

export const round = (value: number, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};
