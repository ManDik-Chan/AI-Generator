import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;
const hasAuthState = Boolean(authState && existsSync(authState));

test.describe("authenticated mobile shell", () => {
  test.skip(!hasAuthState, "Set PLAYWRIGHT_AUTH_STATE to an existing signed-in storage state.");

  test("navigation, tools and common overlays remain inside the viewport", async ({ page }) => {
    for (const route of ["/", "/tools", "/tools/image", "/tools/image-generate", "/tools/brainstorm", "/tools/history", "/personas", "/memories", "/account"] as const) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    const nav = page.locator("[data-mobile-navigation]");
    if (await nav.isVisible()) await expect(nav.getByLabel("新建对话")).toBeVisible();
  });

  test("chat composer grows, remains visible and does not cancel on visibility changes", async ({ page }) => {
    await page.goto("/chat");
    const composer = page.getByLabel("消息内容");
    await composer.fill("第一行\n第二行\n第三行\n第四行");
    await expect(composer).toBeInViewport();
    expect(await composer.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(44);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expectNoHorizontalOverflow(page);
  });

  test("focusing the composer does not reset message or document scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat");
    const scroller = page.locator("[data-chat-message-scroll]");
    const composer = page.getByLabel("消息内容");
    await scroller.evaluate((element) => { element.scrollTop = Math.max(80, element.scrollHeight / 3); });
    const before = await scroller.evaluate((element) => element.scrollTop);
    const windowBefore = await page.evaluate(() => window.scrollY);

    await composer.focus();
    await page.setViewportSize({ width: 390, height: 540 });
    const during = await scroller.evaluate((element) => element.scrollTop);
    expect(during).toBeGreaterThanOrEqual(Math.max(0, before - 2));
    expect(await page.evaluate(() => window.scrollY)).toBe(windowBefore);

    await composer.blur();
    await page.setViewportSize({ width: 390, height: 844 });
    await composer.focus();
    await composer.blur();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(Math.max(0, before - 2));
    await expectNoHorizontalOverflow(page);
  });

  test("conversation history does not prefetch every dynamic detail route", async ({ page }) => {
    const detailRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (/^\/chat\/[0-9a-f-]{36}$/i.test(pathname)) detailRequests.push(pathname);
    });
    await page.goto("/chat", { waitUntil: "networkidle" });
    expect(new Set(detailRequests).size).toBeLessThanOrEqual(1);

    const conversationLinks = page.locator('nav[aria-label="对话历史"] a[href^="/chat/"]');
    const count = await conversationLinks.count();
    if (count > 0) {
      const target = conversationLinks.nth(0);
      const href = await target.getAttribute("href");
      await target.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    }
  });
});
