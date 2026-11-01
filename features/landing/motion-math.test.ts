import { describe, expect, it } from "vitest";

import { boxGap, charFrontier, clearance, projectCard, scrollHeroBox, tilt, toneAt, type Box } from "./motion-math";

const box = (): Box => ({ l: 0, t: 0, r: 0, b: 0 });
const level = tilt(0, 0);

describe("hero card projection", () => {
  it("keeps a card at z = 0 at its own size and position", () => {
    const out = box();
    expect(projectCard(out, 100, -40, 0, 80, 60, level)).toBe(true);
    expect(out).toEqual({ l: 60, r: 140, t: -70, b: -10 });
  });

  it("scales position and size by the perspective factor as the card approaches", () => {
    const out = box();
    projectCard(out, 100, 0, 500, 80, 60, level); // 1000 / (1000 - 500) = 2
    expect(out.l).toBeCloseTo(120);
    expect(out.r).toBeCloseTo(280);
    expect(out.b - out.t).toBeCloseTo(120);
  });

  it("reports cards at or behind the viewer as not visible", () => {
    expect(projectCard(box(), 0, 0, 1000, 80, 60, level)).toBe(false);
  });

  it("applies the camera tilt in CSS order (rotateY to the point first, then rotateX)", () => {
    const out = box();
    // rotateY(90deg) turns +x into -z: the card collapses to the vanishing point and shrinks.
    projectCard(out, 100, 0, 0, 20, 20, tilt(0, 90));
    expect((out.l + out.r) / 2).toBeCloseTo(0, 5);
    expect(out.r - out.l).toBeCloseTo(20 * (1000 / 1100), 5);
    // rotateX(90deg) turns +y into +z (towards the viewer): the card grows.
    projectCard(out, 0, 100, 0, 20, 20, tilt(90, 0));
    expect(out.r - out.l).toBeCloseTo(20 * (1000 / 900), 5);
  });
});

describe("hero copy clearance", () => {
  // A 390px phone: headline ~200 × 86 around the centre.
  const headline: Box = { l: -100, t: -43, r: 100, b: 43 };

  it("hides a card that is outside the old 3D keep-clear zone but projects behind the headline while far away", () => {
    const far = box();
    projectCard(far, 200, 20, -1800, 100, 70, level);
    expect(boxGap(far, headline)).toBeLessThan(0);
    expect(clearance(far, [headline], 10, 48)).toBe(0);
  });

  it("brings the same card back once its projection has left the headline", () => {
    const near = box();
    projectCard(near, 200, 20, 300, 100, 70, level);
    expect(clearance(near, [headline], 10, 48)).toBe(1);
  });

  it("feathers smoothly between the padded edge and full visibility", () => {
    const at = (gap: number) => clearance({ l: headline.r + gap, r: headline.r + gap + 40, t: -10, b: 10 }, [headline], 10, 48);
    expect(at(5)).toBe(0);
    expect(at(10)).toBe(0);
    const mid = at(34);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(at(20)).toBeLessThan(mid);
    expect(at(58)).toBe(1);
  });

  it("uses the closest of several protected boxes", () => {
    const foot: Box = { l: -180, t: 380, r: -40, b: 410 };
    const card: Box = { l: -60, t: 300, r: 0, b: 375 };
    expect(clearance(card, [headline, foot], 10, 48)).toBe(0);
  });

  it("follows the headline as it scales about the hero centre and lifts on scroll", () => {
    expect(scrollHeroBox(box(), headline, 0.92, -126)).toEqual({ l: -92, r: 92, t: -43 * 0.92 - 126, b: 43 * 0.92 - 126 });
  });
});

describe("section tone under the header", () => {
  const bands = [
    { top: 844, height: 6000, tone: "dark" },
    { top: 6844, height: 900, tone: "light" },
    { top: 9000, height: 700, tone: "lime" },
  ];

  it("falls back to light above every themed section", () => {
    expect(toneAt(bands, 100)).toBe("light");
  });

  it("switches exactly at a section edge", () => {
    expect(toneAt(bands, 843.9)).toBe("light");
    expect(toneAt(bands, 844)).toBe("dark");
    expect(toneAt(bands, 6843.9)).toBe("dark");
    expect(toneAt(bands, 6844)).toBe("light");
    expect(toneAt(bands, 9100)).toBe("lime");
  });

  it("lets a later band win where bands overlap", () => {
    expect(toneAt([...bands, { top: 900, height: 100, tone: "lime" }], 950)).toBe("lime");
  });
});

describe("scroll-lit reading frontier", () => {
  it("starts fully dim and ends fully lit", () => {
    expect(charFrontier(0, 40)).toEqual({ lit: 0, level: 0 });
    expect(charFrontier(1, 40)).toEqual({ lit: 40, level: 0 });
    expect(charFrontier(0.99, 40)).toEqual({ lit: 40, level: 0 });
  });

  it("matches the original per-character ramp (count + 10 characters of travel)", () => {
    // progress 0.5 over 40 characters → frontier at 25 characters
    expect(charFrontier(0.5, 40)).toEqual({ lit: 25, level: 0 });
    // 25.5 characters → the 26th character is half lit
    expect(charFrontier(25.5 / 50, 40)).toEqual({ lit: 25, level: 2 });
  });

  it("only ever moves forward as progress grows", () => {
    let prev = -1;
    for (let p = 0; p <= 1; p += 0.001) {
      const { lit, level } = charFrontier(p, 37);
      const pos = lit * 4 + level;
      expect(pos).toBeGreaterThanOrEqual(prev);
      prev = pos;
    }
  });

  it("clamps out-of-range progress and empty copy", () => {
    expect(charFrontier(-1, 10)).toEqual({ lit: 0, level: 0 });
    expect(charFrontier(2, 10)).toEqual({ lit: 10, level: 0 });
    expect(charFrontier(0.5, 0)).toEqual({ lit: 0, level: 0 });
  });
});
