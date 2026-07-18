import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

for (const route of ["/login", "/register"] as const) {
  test(`${route} keeps mobile fields readable without horizontal overflow`, async ({ page }, testInfo) => {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    const field = page.locator('input:not([type="hidden"])').first();
    await field.focus();
    await field.fill(route === "/login" ? "mobile@example.com" : "移动端测试");
    const fontSize = Number.parseFloat(await field.evaluate((element) => getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(testInfo.project.name === "chromium-desktop" ? 14 : 16);
    await expectNoHorizontalOverflow(page);
  });
}

test("viewport metadata keeps user zoom available", async ({ page }) => {
  await page.goto("/login");
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content).toContain("width=device-width");
  expect(content).not.toContain("user-scalable=no");
  expect(content).not.toContain("maximum-scale=1");
});

test("home uses document scrolling and a fluid desktop canvas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Desktop width contract only.");

  for (const width of [1366, 1440, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByText("让你的 AI，", { exact: true })).toBeVisible();
    const metrics = await page.locator("[data-app-scroll-region]").evaluate((main) => {
      const rect = main.getBoundingClientRect();
      return {
        documentOverflow: getComputedStyle(main).overflowY,
        pageWidth: document.documentElement.clientWidth,
        width: rect.width,
      };
    });
    expect(metrics.documentOverflow).toBe("visible");
    expect(metrics.width).toBeGreaterThan((metrics.pageWidth - 272) * 0.82);
    await expectNoHorizontalOverflow(page);
  }
});

test("home primary content is present in the server response", async ({ request }) => {
  const response = await request.get("/");
  const html = await response.text();
  expect(html).toContain("让你的 AI");
  expect(html).toContain("快速启动");
  expect(html).not.toContain("framer-motion");
});
