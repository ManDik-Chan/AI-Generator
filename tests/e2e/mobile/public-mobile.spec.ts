import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

for (const route of ["/login", "/register"] as const) {
  test(`${route} keeps mobile fields readable without horizontal overflow`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    const field = page.locator("input").first();
    await field.focus();
    await field.fill(route === "/login" ? "mobile@example.com" : "移动端测试");
    expect(Number.parseFloat(await field.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
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
