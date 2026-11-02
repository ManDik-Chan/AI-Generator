/*
 * Pure geometry used by the landing runtime. Nothing here touches the DOM, so the
 * rules that keep motion away from readable content can be unit tested directly.
 */

/** Axis-aligned box in px. Hero boxes are measured relative to the hero centre. */
export interface Box { l: number; t: number; r: number; b: number }

/** `perspective` of .hero__field in landing.css. */
export const HERO_PERSPECTIVE = 1000;

export interface Tilt { sinX: number; cosX: number; sinY: number; cosY: number }

/** Camera tilt for `transform: rotateX(degX) rotateY(degY)`. */
export function tilt(degX: number, degY: number): Tilt {
  const ax = (degX * Math.PI) / 180;
  const ay = (degY * Math.PI) / 180;
  return { sinX: Math.sin(ax), cosX: Math.cos(ax), sinY: Math.sin(ay), cosY: Math.cos(ay) };
}

/**
 * Projects a w×h card centred at translate3d(x, y, z) inside the tilted camera onto the
 * screen, writing the box (relative to the perspective origin) into `out`.
 * Returns false when the card is at or behind the viewer.
 */
export function projectCard(out: Box, x: number, y: number, z: number, w: number, h: number, cam: Tilt, perspective = HERO_PERSPECTIVE): boolean {
  // rotateX(a) rotateY(b) applies rotateY to the point first.
  const x1 = cam.cosY * x + cam.sinY * z;
  const z1 = cam.cosY * z - cam.sinY * x;
  const y2 = cam.cosX * y - cam.sinX * z1;
  const z2 = cam.sinX * y + cam.cosX * z1;
  if (z2 >= perspective - 1) return false;
  const s = perspective / (perspective - z2);
  const hw = (w / 2) * s;
  const hh = (h / 2) * s;
  out.l = x1 * s - hw;
  out.r = x1 * s + hw;
  out.t = y2 * s - hh;
  out.b = y2 * s + hh;
  return true;
}

/** Distance between two boxes: positive when apart (largest axis gap), negative when they overlap. */
export function boxGap(a: Box, b: Box): number {
  return Math.max(b.l - a.r, a.l - b.r, b.t - a.b, a.t - b.b);
}

/**
 * Opacity factor for a moving card: 0 while it is within `pad` px of any protected box,
 * easing back to 1 over the next `feather` px.
 */
export function clearance(card: Box, zones: readonly Box[], pad: number, feather: number): number {
  let k = 1;
  for (const zone of zones) {
    const d = boxGap(card, zone) - pad;
    if (d >= feather) continue;
    if (d <= 0) return 0;
    const t = d / feather;
    k = Math.min(k, t * t * (3 - 2 * t));
  }
  return k;
}

/** The hero headline scales about the hero centre and lifts while the hero scrolls away. */
export function scrollHeroBox(out: Box, rest: Box, scale: number, lift: number): Box {
  out.l = rest.l * scale;
  out.r = rest.r * scale;
  out.t = rest.t * scale + lift;
  out.b = rest.b * scale + lift;
  return out;
}

/* ------------------------------------------------------------- section tone */

export interface ToneBand { top: number; height: number; tone: string }

/** Tone of the section under document position `y`; later bands win where they overlap. */
export function toneAt(bands: readonly ToneBand[], y: number, fallback = "light"): string {
  let tone = fallback;
  for (const band of bands) if (y >= band.top && y < band.top + band.height) tone = band.tone;
  return tone;
}

/* ------------------------------------------------------- scroll-lit copy */

/** Partial brightness steps for the character at the reading frontier. */
export const CHAR_LEVELS = 4;

/** CSS highlight names (landing.css): the unread part, then partial steps 1..CHAR_LEVELS-1 of the frontier character. */
export const CHAR_HIGHLIGHTS = ["lp-ch-dim", "lp-ch-1", "lp-ch-2", "lp-ch-3"] as const;

/**
 * Reading frontier for scroll-lit copy: `lit` characters are fully lit and the next one
 * shows partial step `level` (0 = still dim). Matches the original per-character ramp,
 * which finished 10 characters' worth of scroll before the end of the block.
 */
export function charFrontier(progress: number, count: number, levels = CHAR_LEVELS): { lit: number; level: number } {
  if (count <= 0) return { lit: 0, level: 0 };
  const f = Math.min(Math.max(progress, 0), 1) * (count + 10);
  let lit = Math.floor(f);
  let level = Math.round((f - lit) * levels);
  if (level >= levels) { lit += 1; level = 0; }
  if (lit >= count) return { lit: count, level: 0 };
  return { lit, level };
}
