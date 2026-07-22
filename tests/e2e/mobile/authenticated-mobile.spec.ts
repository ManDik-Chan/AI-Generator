import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  expectComposerInsideVisualViewport,
  expectNoHorizontalOverflow,
  expectScrollPositionPreserved,
  expectSinglePrimaryScroller,
} from "./helpers";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;
const hasAuthState = Boolean(authState && existsSync(authState));

test.describe("authenticated mobile shell", () => {
  test.skip(!hasAuthState, "Set PLAYWRIGHT_AUTH_STATE to an existing signed-in storage state.");

  test("navigation, tools and common overlays remain inside the viewport", async ({ page }) => {
    const routes = [
      { path: "/", heading: /让你的 AI，.*真正成为一个工作室。/ },
      { path: "/agents", heading: "Agent 运行" },
      { path: "/tools", heading: "实用 AI 工具" },
      { path: "/tools/image", heading: "图片分析" },
      { path: "/tools/image-generate", heading: "AI 图片创作" },
      { path: "/tools/brainstorm", heading: "多 Agent 头脑风暴" },
      { path: "/tools/history", heading: "工具历史" },
      { path: "/personas", heading: "我的私人助手" },
      { path: "/memories", heading: "AI 记忆库" },
      { path: "/account", heading: "账号与设置" },
    ] as const;

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.locator("[data-app-scroll-region]")).toHaveCount(1);
      await expect(page.locator("[data-app-scroll-region]")).toBeVisible();
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

  test("Chat follows mocked iPhone visual viewport changes without moving the document", async ({ page }) => {
    await page.addInitScript(() => {
      const viewport = new EventTarget() as EventTarget & {
        height: number;
        width: number;
        offsetTop: number;
        offsetLeft: number;
        pageTop: number;
        pageLeft: number;
        scale: number;
      };
      Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      Object.defineProperty(window, "__setChatVisualViewport", {
        configurable: true,
        value: (height: number, offsetTop = 0) => {
          viewport.height = height;
          viewport.offsetTop = offsetTop;
          viewport.dispatchEvent(new Event("resize"));
          viewport.dispatchEvent(new Event("scroll"));
        },
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat");
    const shell = page.locator("[data-chat-shell]");
    const scroller = page.locator("[data-chat-message-scroll]");
    await expect(page.getByLabel("消息内容")).toBeEditable();
    await scroller.evaluate((element) => {
      const fixture = document.createElement("div");
      fixture.style.height = "1800px";
      fixture.setAttribute("aria-hidden", "true");
      element.firstElementChild?.append(fixture);
    });
    await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(1000);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await scroller.evaluate((element) => { element.scrollTop = 420; });
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(420);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(420);

    await expectSinglePrimaryScroller(page);
    await expectScrollPositionPreserved(page, async () => {
      await page.evaluate(() => (window as typeof window & { __setChatVisualViewport(height: number, top?: number): void }).__setChatVisualViewport(540));
    });
    await expect.poll(() => shell.evaluate((element) => element.style.getPropertyValue("--chat-viewport-height"))).toBe("540px");
    await expectComposerInsideVisualViewport(page);

    await expectScrollPositionPreserved(page, async () => {
      await page.evaluate(() => (window as typeof window & { __setChatVisualViewport(height: number, top?: number): void }).__setChatVisualViewport(500, 44));
    });
    await expect.poll(() => shell.evaluate((element) => element.style.getPropertyValue("--chat-viewport-top"))).toBe("44px");

    await expectScrollPositionPreserved(page, async () => {
      await page.evaluate(() => (window as typeof window & { __setChatVisualViewport(height: number, top?: number): void }).__setChatVisualViewport(844));
    });
    await expect.poll(() => shell.evaluate((element) => element.style.getPropertyValue("--keyboard-inset"))).toBe("0px");
    await expect(page.locator("html")).not.toHaveAttribute("style", /chat-viewport|keyboard-inset|composer-height/);
  });

  test("conversation history does not prefetch every dynamic detail route", async ({ page }) => {
    const detailRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (/^\/chat\/[0-9a-f-]{36}$/i.test(pathname)) detailRequests.push(pathname);
    });
    await page.goto("/chat", { waitUntil: "networkidle" });
    expect(new Set(detailRequests).size).toBeLessThanOrEqual(1);

    const openHistory = page.getByRole("button", { name: "打开对话历史" });
    if (await openHistory.isVisible()) await openHistory.click();

    const history = page.locator('nav[aria-label="对话历史"]:visible');
    const target = history.locator('a[href^="/chat/"]').first();
    await expect(target).toBeVisible();
    const href = await target.getAttribute("href");
    expect(href).not.toBeNull();
    await target.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});
