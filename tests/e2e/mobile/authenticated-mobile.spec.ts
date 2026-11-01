import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { waitForInteractiveChat } from "../support/chat-terminal";

import {
  expectComposerInsideVisualViewport,
  expectNoHorizontalOverflow,
  expectScrollPositionPreserved,
  expectSinglePrimaryScroller,
} from "./helpers";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;
const hasAuthState = Boolean(
  authState && (process.env.CI || existsSync(authState)),
);

test.describe("authenticated mobile shell", () => {
  test.skip(!hasAuthState, "Set PLAYWRIGHT_AUTH_STATE to an existing signed-in storage state.");

  test("a regular authenticated user cannot open the administrator page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin(?:\/|$)/);
    await expect(page.getByText("管理控制台")).toHaveCount(0);
  });

  test("navigation, tools and common overlays remain inside the viewport", async ({ page }) => {
    const routes = [
      { path: "/workspace", heading: /把想法做成项目，\s*把项目带到台前。/ },
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

  test("memory page separates untrusted proposals from confirmed memory", async ({ page }) => {
    await page.goto("/memories");
    await expect(page.getByRole("heading", { name: "AI 建议记住" })).toBeVisible();
    await expect(page.getByText("确认后才会用于未来对话", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "正式记忆" })).toBeVisible();
    await expect(page.getByText("唯一召回真相源", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("chat composer grows and preserves its draft through coalesced session return checks", async ({ page }) => {
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      const outcomes: Array<number | "rejected"> = [];
      Object.defineProperty(window, "__aigSessionFetchOutcomes", { value: outcomes });
      window.fetch = (...args) => {
        const [input] = args;
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
        const fetched = nativeFetch(...args);
        if (url.pathname !== "/api/auth/session") return fetched;
        // Observe native fetch fulfillment, returning its exact Response to the
        // application. No status, body or failure is fabricated by this probe.
        return fetched.then((response) => {
          outcomes.push(response.status);
          return response;
        }, (error: unknown) => {
          outcomes.push("rejected");
          throw error;
        });
      };
    });
    let bootstrapRequests = 0;
    let sessionRequests = 0;
    let chatRscRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/chat/bootstrap") bootstrapRequests++;
      if (url.pathname === "/api/auth/session") sessionRequests++;
      if (url.pathname === "/chat" && (request.headers()["rsc"] === "1" || url.searchParams.has("_rsc"))) chatRscRequests++;
    });
    await page.goto("/chat");
    const { composer } = await waitForInteractiveChat(page);
    const draft = "第一行\n第二行\n第三行\n第四行";
    await composer.fill(draft);
    await expect(composer).toBeInViewport();
    await expect.poll(
      () => composer.evaluate((element) => element.getBoundingClientRect().height),
      { timeout: 5_000 },
    ).toBeGreaterThan(44);
    await expect.poll(() => bootstrapRequests).toBe(1);
    expect(sessionRequests, "A normal entry is already validated by the server.").toBe(0);
    const initialRscRequests = chatRscRequests;

    // Hold the real check in flight until the return-event burst finishes. Its
    // actual server response is still required; no success response is mocked.
    let releaseCheck!: () => void;
    const checkGate = new Promise<void>((resolve) => { releaseCheck = resolve; });
    await page.route("**/api/auth/session", async (route) => {
      await checkGate;
      await route.continue();
    });
    const checkStarted = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/auth/session");
    const background = await page.context().newPage();
    try {
      await composer.blur();
      // The second tab and return exercise real window focus changes. Explicit
      // lifecycle events cover the corresponding bfcache return burst too.
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await background.bringToFront();
      await page.bringToFront();
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
        window.dispatchEvent(new Event("focus"));
      });
      await composer.focus();
      await checkStarted;
      expect(sessionRequests, "Return events must share their in-flight session check.").toBe(1);
      const checked = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/session");
      releaseCheck();
      const response = await checked;
      expect(response.status(), "The existing server session must still be valid.").toBe(204);
      // The bodyless check must fulfill in the application. Chromium's trace
      // reported the real 204 while Response.finished() never settled.
      await expect.poll(() => page.evaluate(() => (window as Window & {
        __aigSessionFetchOutcomes?: Array<number | "rejected">;
      }).__aigSessionFetchOutcomes), {
        timeout: 5_000,
        message: "Native browser fetch must fulfill the real session check exactly once.",
      }).toEqual([204]);
      await waitForInteractiveChat(page);
      await expect(composer).toHaveValue(draft);
      expect(sessionRequests).toBe(1);
      expect(bootstrapRequests, "Session validation must not remount Chat or reload bootstrap.").toBe(1);
      expect(chatRscRequests, "A valid return check must not refresh the RSC route.").toBe(initialRscRequests);
    } finally {
      releaseCheck();
      await background.close();
    }
    await expectNoHorizontalOverflow(page);
  });

  test("focusing the composer does not reset message or document scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat");
    const { shell, composer } = await waitForInteractiveChat(page);
    const scroller = shell.locator("[data-chat-message-scroll]");
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
    const { shell } = await waitForInteractiveChat(page);
    const scroller = shell.locator("[data-chat-message-scroll]");
    await scroller.evaluate((element) => {
      const fixture = document.createElement("div");
      fixture.style.height = "1800px";
      fixture.setAttribute("aria-hidden", "true");
      element.firstElementChild?.append(fixture);
    });
    await expect.poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(1000);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const scrollToBottomButton = page.getByRole("button", { name: "回到底部" });
    await expect.poll(async () => {
      await scroller.evaluate((element) => {
        element.scrollTop = 419;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
        element.scrollTop = 420;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      return scrollToBottomButton.isVisible();
    }).toBe(true);
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
