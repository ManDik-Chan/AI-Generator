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
    await expect(page.getByRole("heading", { level: 1, name: /懂你所想，\s*守你所藏。/ })).toBeVisible();
    await expect(page.locator("[data-app-scroll-region]")).toHaveCount(0);
    const metrics = await page.locator("[data-landing]").evaluate((main) => {
      const rect = main.getBoundingClientRect();
      return {
        documentOverflow: getComputedStyle(main).overflowY,
        pageWidth: document.documentElement.clientWidth,
        width: rect.width,
      };
    });
    expect(metrics.documentOverflow).toBe("visible");
    expect(metrics.width).toBeGreaterThan(metrics.pageWidth * 0.99);
    await expectNoHorizontalOverflow(page);
  }
});

test("home primary content is present in the server response", async ({ request }) => {
  const response = await request.get("/");
  const html = await response.text();
  expect(html).toContain("懂你所想");
  expect(html).toContain("守你所藏");
  expect(html).not.toContain("framer-motion");
});

test("landing mobile navigation opens, dismisses and routes to a protected page", async ({ page }) => {
  await page.context().clearCookies();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=zh");
  const toggle = page.locator("[data-menu-btn]");
  await expect(toggle).toHaveAccessibleName("打开菜单");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAccessibleName("关闭菜单");
  await expect(page.getByRole("navigation", { name: "移动端导航" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.getByRole("navigation", { name: "移动端导航" }).getByRole("link", { name: "AI 对话" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fchat/);
  await expect(page.locator('input[name="next"]')).toHaveValue("/chat");
});

test("landing language switch persists the selected language", async ({ page }) => {
  await page.goto("/?lang=zh");
  await page.getByRole("button", { name: "切换语言" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page).toHaveURL(/\?lang=en/);
  await expect(page.getByRole("heading", { level: 1, name: /Knows your mind,\s*keeps your trust\./ })).toBeVisible();
  expect((await page.context().cookies()).find((cookie) => cookie.name === "aig-lang")?.value).toBe("en");
});
