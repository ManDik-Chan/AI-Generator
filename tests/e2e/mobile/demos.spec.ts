import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

/*
 * Runnable demos, developer docs and the public Demo API. Everything here is public:
 * no account, no database and no AI provider is involved.
 */

test("the demo index lists both demos and links into them", async ({ page }) => {
  await page.goto("/demos");
  await expect(page.getByRole("heading", { level: 1, name: /不是录屏，\s*是真的在运行。/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "路线优化求解器" })).toHaveAttribute("href", "/demos/route-optimizer");
  await expect(page.getByRole("link", { name: "神经网络训练场" })).toHaveAttribute("href", "/demos/neural-network");
  await expectNoHorizontalOverflow(page);
});

test("route optimizer solves on the server and streams the run lifecycle", async ({ page }) => {
  await page.goto("/demos/route-optimizer");
  await page.getByRole("button", { name: "在服务端求解" }).click();
  const timeline = page.getByRole("list", { name: "运行状态" });
  await expect(timeline.getByText("SUCCEEDED", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(timeline.getByText("RUNNING", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "响应" }).click();
  await expect(page.getByRole("tabpanel")).toContainText('"status": "SUCCEEDED"');
  await expectNoHorizontalOverflow(page);
});

test("route optimizer reports a deadline as TIMED_OUT with the best tour so far", async ({ page }) => {
  await page.goto("/demos/route-optimizer");
  await page.getByRole("button", { name: "模拟退火" }).click();
  const iterations = page.getByLabel("退火迭代次数");
  await iterations.focus();
  await iterations.press("End");
  const deadline = page.getByLabel("截止时间");
  await deadline.focus();
  await deadline.press("Home");
  await page.getByRole("button", { name: "在服务端求解" }).click();
  await expect(page.getByRole("list", { name: "运行状态" }).getByText("TIMED_OUT", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/截止前找到的最好路线/)).toBeVisible();
});

test("neural network trains in the browser and finishes the run", async ({ page }) => {
  await page.goto("/demos/neural-network");
  await expect(page.getByRole("img", { name: /数据集的决策边界/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("group", { name: "每次训练轮数" }).getByRole("button", { name: "50", exact: true }).click();
  await page.getByRole("button", { name: "训练 50 轮" }).click();
  await expect(page.getByRole("list", { name: "运行状态" }).getByText("SUCCEEDED", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Web Worker|主线程（降级）/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("developer docs render from Markdown and the request console calls the real API", async ({ page }) => {
  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { level: 1, name: "API Reference" })).toBeVisible();
  await expect(page.locator("#post-api-demo-v1-runs")).toBeVisible();
  await page.getByRole("button", { name: "能力列表" }).click();
  await page.getByRole("button", { name: "发送请求" }).click();
  await expect(page.getByText("HTTP 200")).toBeVisible({ timeout: 15_000 });

  await page.goto("/docs/guide");
  await expect(page.getByRole("heading", { level: 1, name: "开发者手册" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("the public Demo API validates input and rejects browser capabilities", async ({ request }) => {
  const list = await request.get("/api/demo/v1/capabilities");
  expect(list.status()).toBe(200);
  expect((await list.json()).data.map((capability: { id: string }) => capability.id)).toEqual(["route-optimizer.solve", "neural-network.train"]);

  const browserOnly = await request.post("/api/demo/v1/runs", { data: { capability: "neural-network.train", input: {} } });
  expect(browserOnly.status()).toBe(422);
  expect((await browserOnly.json()).code).toBe("SEMANTIC_REJECTION");

  const invalid = await request.post("/api/demo/v1/runs", { data: { capability: "route-optimizer.solve", input: { points: [[1, 2]] } } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).issues[0].path).toBe("input.points");
});

test("the landing page leads to the demos and the developer docs", async ({ page }) => {
  await page.goto("/?lang=zh");
  await expect(page.locator('a.fcard[href="/demos"]')).toHaveCount(1);
  await expect(page.locator('a[href="/docs"]').first()).toBeAttached();
});
