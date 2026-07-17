import { expect, type Page } from "@playwright/test";

export async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.right > root.clientWidth + 1 || rect.left < -1)
      .slice(0, 8)
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      }));
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowing,
    };
  });

  expect(result.scrollWidth, JSON.stringify(result.overflowing, null, 2)).toBeLessThanOrEqual(result.clientWidth + 1);
}

export async function expectSinglePrimaryScroller(page: Page) {
  const result = await page.evaluate(() => ({
    chatScrollers: document.querySelectorAll("[data-chat-message-scroll]").length,
    documentOverflow: Math.max(
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
      document.body.scrollHeight - document.body.clientHeight,
    ),
  }));
  expect(result.chatScrollers).toBe(1);
  expect(result.documentOverflow).toBeLessThanOrEqual(1);
}

export async function expectComposerInsideVisualViewport(page: Page) {
  const result = await page.locator("[data-chat-composer]").evaluate((composer) => {
    const rect = composer.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    return { composerTop: rect.top, composerBottom: rect.bottom, viewportTop: top, viewportBottom: bottom };
  });
  expect(result.composerTop).toBeGreaterThanOrEqual(result.viewportTop - 1);
  expect(result.composerBottom).toBeLessThanOrEqual(result.viewportBottom + 1);
}

export async function expectScrollPositionPreserved(
  page: Page,
  action: () => Promise<void>,
  tolerance = 2,
) {
  const scroller = page.locator("[data-chat-message-scroll]");
  const before = await scroller.evaluate((element) => element.scrollTop);
  await action();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const after = await scroller.evaluate((element) => element.scrollTop);
  expect(after).toBeGreaterThanOrEqual(Math.max(0, before - tolerance));
  expect(after).toBeLessThanOrEqual(before + tolerance);
}
