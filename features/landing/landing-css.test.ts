import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CHAR_HIGHLIGHTS, CHAR_LEVELS, HERO_PERSPECTIVE } from "./motion-math";

const css = readFileSync(fileURLToPath(new URL("./landing.css", import.meta.url)), "utf8");

/** Declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`No rule for ${selector}`);
  return match[1];
}
const token = (name: string) => {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`No token ${name}`);
  return match[1].trim();
};

type Rgba = [number, number, number, number];
function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (!rgba) throw new Error(`Unsupported colour ${value}`);
  const [r, g, b, a = 1] = rgba[1].split(",").map((part) => parseFloat(part));
  return [r, g, b, a];
}
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
const luminance = ([r, g, b]: Rgba) => {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("landing header contrast through scroll transitions", () => {
  const ink = parseColor(token("--ink"));

  it.each(["--chip-veil", "--chip-veil-dark"])("%s keeps the ink language label at 4.5:1 over any backdrop", (name) => {
    const veil = parseColor(token(name));
    for (const backdrop of [[0, 0, 0, 1], [255, 255, 255, 1], [18, 14, 13, 1], [15, 42, 36, 1]] as Rgba[]) {
      expect(contrast(ink, over(veil, backdrop))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("gives the language switch a veil in both header tones", () => {
    expect(rule(".lp .lang__btn")).toMatch(/background:\s*var\(--chip-veil\)/);
    expect(rule(".lp .lang__btn")).toMatch(/color:\s*var\(--ink\)/);
    expect(rule('.lp .header[data-tone="dark"] .lang__btn')).toMatch(/background:\s*var\(--chip-veil-dark\)/);
  });

  it("swaps header text and fill colours in one frame instead of cross-fading them", () => {
    const pill = rule(".lp .header .pill");
    expect(pill).toMatch(/transition:/);
    expect(pill).not.toMatch(/color|background/);
    expect(rule(".lp .header")).not.toMatch(/transition/);
  });
});

describe("floating chat button lane", () => {
  it("reserves more than the button's width for bottom-left copy", () => {
    const lane = token("--fab-lane").match(/^calc\(var\(--fab\) \+ (\d+)px\)$/);
    expect(lane).not.toBeNull();
    expect(Number(lane?.[1])).toBeGreaterThanOrEqual(8);
    expect(rule(".lp .fab")).toMatch(/width:\s*var\(--fab\);\s*height:\s*var\(--fab\)/);
  });

  it("keeps every line of the footer's bottom row out of the lane, including when the row stacks", () => {
    expect(rule(".lp .hero__foot > p:first-child, .lp .footer__bottom")).toMatch(/padding-left:\s*var\(--fab-lane\)/);
    expect(css).not.toMatch(/\.footer__bottom\s*>\s*span:first-child/);
  });
});

describe("runtime and stylesheet stay in sync", () => {
  it("projects hero cards with the same perspective the stylesheet renders", () => {
    expect(rule(".lp .hero__field")).toContain(`perspective: ${HERO_PERSPECTIVE}px`);
  });

  it("styles every highlight the scroll-lit copy uses, for both scroll-lit blocks", () => {
    expect(CHAR_HIGHLIGHTS).toHaveLength(CHAR_LEVELS);
    for (const host of [".about__text", ".forest__quote"]) {
      for (const name of CHAR_HIGHLIGHTS) expect(css).toContain(`.lp ${host}::highlight(${name})`);
    }
  });

  it("no longer styles per-character spans or a visually hidden duplicate label", () => {
    expect(css).not.toMatch(/\[data-chars\]\s+\.ch\b/);
    expect(css).not.toMatch(/roll-t__c\s*>\s*span/);
  });
});
