import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;
const hasAuthState = Boolean(
  authState && (process.env.CI || existsSync(authState)),
);

test.describe("authenticated Chat entry performance", () => {
  test.skip(!hasAuthState, "Set PLAYWRIGHT_AUTH_STATE to measure an existing signed-in session.");

  test("keeps the Composer interactive while the non-critical bootstrap is delayed", async ({ page }) => {
    await page.goto("/chat");
    await expect(page.locator("[data-chat-shell]")).toBeVisible();
    await page.goto("/");

    const requests: string[] = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await page.route("**/api/chat/bootstrap**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [], personas: [] }) });
    });

    const link = page.getByRole("link", { name: "开始新对话" });
    await expect(page.locator("[data-navigation-feedback]")).toHaveAttribute(
      "data-ready",
      "true",
    );
    const startedAt = performance.now();
    const feedbackMs = await link.evaluate((linkElement) => {
      const started = performance.now();
      (linkElement as HTMLElement).click();
      if (linkElement.getAttribute("aria-busy") !== "true") {
        throw new Error("Navigation feedback did not mark the activated link as busy.");
      }
      return performance.now() - started;
    });
    await expect(page.locator("[data-chat-shell]")).toBeVisible({ timeout: 1_500 });
    await expect(page.getByLabel("消息内容")).toBeEditable({ timeout: 1_500 });
    const composerMs = performance.now() - startedAt;

    expect(feedbackMs).toBeLessThan(100);
    expect(composerMs).toBeLessThan(1_500);
    await expect(page.getByLabel("正在加载对话历史")).toHaveCount(1);
    expect(requests.filter((path) => path === "/api/chat/bootstrap")).toHaveLength(1);
    expect(requests.some((path) => /^\/api\/agents\/[0-9a-f-]+$/i.test(path))).toBe(false);
  });
});
