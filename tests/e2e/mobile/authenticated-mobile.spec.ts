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
});
