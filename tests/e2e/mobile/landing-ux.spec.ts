import { expect, test, type Page } from "@playwright/test";

// Public surfaces: a signed-out visitor, independent of the shared authenticated state.
test.use({ storageState: { cookies: [], origins: [] } });

async function openLanding(page: Page) {
  await page.goto("/?lang=zh");
  // The preloader hands over to the page (and the runtime has measured it) once .is-loaded is set.
  await expect(page.locator(".lp.is-loaded")).toHaveCount(1, { timeout: 15_000 });
}

test("rolling labels give selection, copy and text extraction their text exactly once", async ({ page }) => {
  await openLanding(page);
  const link = page.locator("footer").getByRole("link", { name: "登录", exact: true });
  await expect(link).toHaveCount(1);
  const text = await link.evaluate((el) => {
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return { inner: (el as HTMLElement).innerText.trim(), copied: selection?.toString().trim(), content: el.textContent };
  });
  expect(text).toEqual({ inner: "登录", copied: "登录", content: "登录" });
});

test("scroll-lit copy stays one plain text node and is dimmed by highlights, not by per-character elements", async ({ page }) => {
  await openLanding(page);
  const result = await page.locator(".about__text").evaluate((el) => {
    const registry = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights;
    const dim = registry?.get("lp-ch-dim");
    const unread = dim ? [...dim].find((range) => el.contains(range.commonAncestorContainer))?.toString() ?? "" : null;
    return { elements: el.childElementCount, text: el.textContent ?? "", unread };
  });
  expect(result.elements).toBe(0);
  expect(result.text).toContain("AI-Generator 正在成为一个隐私优先的项目平台");
  // Before the reader scrolls there, the whole paragraph is the unread (dimmed) range.
  if (result.unread !== null) expect(result.unread).toBe(result.text.trim());
});

test("bottom-left copy keeps clear of the floating chat button", async ({ page }) => {
  await openLanding(page);
  const lanes = await page.evaluate(() => {
    const fab = document.querySelector<HTMLElement>(".fab");
    if (!fab) return null;
    // Layout box: the button scales in and follows the pointer, but its resting lane is what matters.
    const fabRight = fab.offsetLeft + fab.offsetWidth;
    const lefts = [...document.querySelectorAll(".footer__bottom > span, .hero__foot > p")].flatMap((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.left));
    });
    return { fabRight, lefts };
  });
  expect(lanes).not.toBeNull();
  expect(lanes!.lefts.length).toBeGreaterThanOrEqual(4);
  for (const left of lanes!.lefts) expect(left).toBeGreaterThanOrEqual(lanes!.fabRight + 4);
});

test("hero cards fade out before they pass behind the headline or the foot copy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "webkit-iphone", "The projected 3D geometry is sampled in Chromium (desktop and mobile widths).");
  await openLanding(page);
  // Let the headline and foot finish their entrance so the text sits at rest.
  await page.waitForTimeout(2_500);
  for (let sample = 0; sample < 12; sample++) {
    const covered = await page.evaluate(() => {
      const text = [...document.querySelectorAll("#lp-hero-title, .hero__foot > p")].flatMap((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects()].filter((rect) => rect.width > 0);
      });
      return [...document.querySelectorAll<HTMLElement>(".hcard")]
        .filter((card) => parseFloat(getComputedStyle(card).opacity) >= 0.06)
        .flatMap((card) => {
          const c = (card.firstElementChild as HTMLElement).getBoundingClientRect();
          return text
            .filter((t) => c.left < t.right - 2 && c.right > t.left + 2 && c.top < t.bottom - 2 && c.bottom > t.top + 2)
            .map((t) => ({ card: card.className, opacity: getComputedStyle(card).opacity, cardBox: [c.left, c.top, c.right, c.bottom].map(Math.round), textBox: [t.left, t.top, t.right, t.bottom].map(Math.round) }));
        });
    });
    expect(covered).toEqual([]);
    await page.waitForTimeout(150);
  }
});

test("login and register titles have one h1 and never wrap a lone glyph", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Width sweep runs once in Chromium.");
  for (const route of ["/login", "/register"]) {
    for (const width of [320, 390, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      const lines = await page.locator("h1").evaluate((h1) => {
        const range = document.createRange();
        range.selectNodeContents(h1);
        const rows = new Map<number, { left: number; right: number }>();
        for (const rect of range.getClientRects()) {
          if (!rect.width) continue;
          const key = Math.round(rect.top);
          const row = rows.get(key);
          rows.set(key, row ? { left: Math.min(row.left, rect.left), right: Math.max(row.right, rect.right) } : { left: rect.left, right: rect.right });
        }
        return { fontSize: parseFloat(getComputedStyle(h1).fontSize), widths: [...rows.values()].map((row) => row.right - row.left) };
      });
      for (const lineWidth of lines.widths) expect(lineWidth, `${route} @ ${width}px`).toBeGreaterThan(lines.fontSize * 1.5);
    }
  }
});
