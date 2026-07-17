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
