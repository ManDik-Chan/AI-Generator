import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 896, height: 414 },
  { width: 932, height: 430 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const;

test("public Lumen surfaces remain fluid across the acceptance viewport matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "The complete matrix runs once in Chromium; device projects cover mobile Chromium and WebKit separately.");
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByText("让你的 AI，", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.goto("/login");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator('input:not([type="hidden"])').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  expect(errors).toEqual([]);
});

test("public forms tolerate enlarged system text without disabling browser zoom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "Text scaling contract runs once.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect(page.locator('input:not([type="hidden"])').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
