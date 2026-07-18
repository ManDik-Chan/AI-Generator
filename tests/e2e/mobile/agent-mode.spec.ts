import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;
const hasAuthState = Boolean(authState && existsSync(authState));
const ids = {
  run: "44444444-4444-4444-8444-444444444444",
  conversation: "11111111-1111-4111-8111-111111111111",
  userMessage: "22222222-2222-4222-8222-222222222222",
  assistantMessage: "33333333-3333-4333-8333-333333333333",
};
const startedAt = "2026-07-18T08:00:00.000Z";

type WorkerStatus = "QUEUED" | "BLOCKED" | "RUNNING" | "COMPLETE" | "ERROR" | "CANCELLED" | "TIMEOUT";

function worker(key: string, position: number, status: WorkerStatus = "COMPLETE", dependsOnKeys: string[] = []) {
  const successful = status === "COMPLETE";
  return {
    key,
    position,
    name: `Worker ${position + 1}`,
    title: `${key} 专项分析`,
    objective: `独立完成 ${key} 的分析`,
    expectedDeliverable: `${key} 的可核验结论`,
    priority: position === 0 ? "HIGH" : "MEDIUM",
    status,
    dependsOnKeys,
    workSummary: successful ? `${key} 已完成` : null,
    findings: successful ? [`${key} 发现`] : [],
    assumptions: [],
    risks: [],
    recommendations: successful ? [`${key} 建议`] : [],
    finalDeliverable: successful ? `${key} 最终交付物` : null,
    structured: successful,
    errorCode: status === "TIMEOUT" ? "TIMEOUT" : status === "BLOCKED" ? "DEPENDENCY_FAILED" : status === "CANCELLED" ? "CANCELLED" : null,
    startedAt: status === "QUEUED" || status === "BLOCKED" ? null : startedAt,
    completedAt: ["BLOCKED", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"].includes(status) ? "2026-07-18T08:00:05.000Z" : null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

function encodeSse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

interface MockScenario {
  mode: "STANDARD" | "DEEP";
  statuses?: WorkerStatus[];
  fallback?: boolean;
  detached?: boolean;
  conversationId?: string;
}

async function installAgentMocks(page: Page, scenario: MockScenario) {
  const workerCount = scenario.mode === "DEEP" ? 6 : 4;
  const conversationId = scenario.conversationId ?? ids.conversation;
  const keys = Array.from({ length: workerCount }, (_, index) => `worker-${index + 1}`);
  const statuses = scenario.statuses ?? keys.map(() => "COMPLETE" as const);
  let runCancelled = false;
  let cancelledWorkerKey: string | undefined;
  let requestBody: Record<string, unknown> | undefined;

  const plannedWorkers = keys.map((key, index) => ({
    key,
    name: `Worker ${index + 1}`,
    title: `${key} 专项分析`,
    objective: `独立完成 ${key} 的分析`,
    expectedDeliverable: `${key} 的可核验结论`,
    priority: index === 0 ? "HIGH" : "MEDIUM",
    dependsOn: index === workerCount - 1 && scenario.fallback ? [keys[workerCount - 2]] : [],
  }));

  const currentWorkers = () => plannedWorkers.map((item, index) => worker(
    item.key,
    index,
    runCancelled ? "CANCELLED" : cancelledWorkerKey === item.key ? "CANCELLED" : statuses[index],
    item.dependsOn,
  ));

  const snapshot = () => {
    const workers = currentWorkers();
    const terminal = !scenario.detached || runCancelled;
    return {
      id: ids.run,
      conversationId,
      conversationTitle: "Playwright Agent 验证",
      userMessageId: ids.userMessage,
      userProblem: "验证 Agent 编排",
      assistantMessageId: ids.assistantMessage,
      mode: scenario.mode,
      status: runCancelled ? "CANCELLED" : terminal ? "COMPLETE" : "PENDING",
      phase: terminal ? "FINISHED" : "WORKING",
      planOverview: "由相互隔离的 Worker 分工并由 Leader 汇总。",
      planFallback: Boolean(scenario.fallback),
      plannedWorkerCount: workerCount,
      completedWorkerCount: workers.filter((item) => ["BLOCKED", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"].includes(item.status)).length,
      successfulWorkerCount: workers.filter((item) => item.status === "COMPLETE").length,
      providerCallCount: scenario.mode === "DEEP" ? 8 : 6,
      errorCode: runCancelled ? "CANCELLED" : null,
      startedAt,
      completedAt: terminal ? "2026-07-18T08:00:06.000Z" : null,
      createdAt: startedAt,
      updatedAt: startedAt,
      assistantMessage: {
        content: runCancelled ? "" : terminal ? "这是 Leader 的最终回答。" : "",
        status: runCancelled ? "CANCELLED" : terminal ? "COMPLETE" : "PENDING",
        createdAt: startedAt,
      },
      workers,
      events: [],
      usage: { limit: 6, used: scenario.mode === "DEEP" ? 2 : 1, remaining: scenario.mode === "DEEP" ? 4 : 5, unlimited: false },
    };
  };

  await page.route("**/api/agents", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    const chunks = [
      encodeSse("run", {
        runId: ids.run,
        conversationId,
        conversationUpdatedAt: startedAt,
        userMessageId: ids.userMessage,
        assistantMessageId: ids.assistantMessage,
        startedAt,
        mode: scenario.mode,
        usage: snapshot().usage,
      }),
      encodeSse(scenario.fallback ? "plan_fallback" : "plan_ready", {
        overview: "由相互隔离的 Worker 分工并由 Leader 汇总。",
        workers: plannedWorkers,
      }),
    ];
    keys.forEach((key, index) => {
      chunks.push(encodeSse("worker_started", { workerKey: key }));
      const status = statuses[index];
      if (status === "COMPLETE") chunks.push(encodeSse("worker_done", { workerKey: key, deliverable: worker(key, index).finalDeliverable ? {
        workSummary: `${key} 已完成`, findings: [`${key} 发现`], assumptions: [], risks: [], recommendations: [`${key} 建议`], finalDeliverable: `${key} 最终交付物`, structured: true,
      } : {} }));
      if (status === "TIMEOUT") chunks.push(encodeSse("worker_timeout", { workerKey: key, code: "TIMEOUT" }));
      if (status === "BLOCKED") chunks.push(encodeSse("worker_blocked", { workerKey: key, code: "DEPENDENCY_FAILED" }));
      if (status === "ERROR") chunks.push(encodeSse("worker_error", { workerKey: key, code: "PROVIDER_ERROR" }));
    });
    if (!scenario.detached) {
      chunks.push(encodeSse("synthesis_started", {}));
      chunks.push(encodeSse("synthesis_delta", { text: "这是 Leader 的最终回答。" }));
      chunks.push(encodeSse("done", {}));
    }
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "Cache-Control": "no-cache, no-transform" },
      body: chunks.join(""),
    });
  });

  await page.route(`**/api/agents/${ids.run}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot()) });
  });
  await page.route(`**/api/agents/${ids.run}/status`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot()) });
  });
  await page.route(`**/api/agents/${ids.run}/cancel`, async (route) => {
    runCancelled = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "CANCELLED" }) });
  });
  await page.route(`**/api/agents/${ids.run}/workers/*/cancel`, async (route) => {
    cancelledWorkerKey = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "CANCELLED" }) });
  });

  return { getRequestBody: () => requestBody };
}

async function submitAgent(page: Page, label: "Agent 标准" | "Agent 深度") {
  await page.goto("/chat");
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByLabel("消息内容").fill("验证 Agent 编排");
  await page.getByRole("button", { name: "发送消息" }).click();
}

async function installCompletedChatMock(page: Page) {
  const conversationId = "55555555-5555-4555-8555-555555555555";
  const userMessageId = "66666666-6666-4666-8666-666666666666";
  const assistantMessageId = "77777777-7777-4777-8777-777777777777";
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: [
        encodeSse("conversation", { conversationId, updatedAt: startedAt }),
        encodeSse("turn", { conversationId, userMessageId, assistantMessageId }),
        encodeSse("delta", { text: "Chat B completed" }),
        encodeSse("done", { messageId: assistantMessageId }),
      ].join(""),
    });
  });
}

test.describe("authenticated Agent Mode", () => {
  test.skip(!hasAuthState, "Set PLAYWRIGHT_AUTH_STATE to an existing signed-in storage state.");

  for (const scenario of [
    { mode: "STANDARD" as const, label: "Agent 标准" as const, heading: "AGENT WORKERS · 标准", workers: 4 },
    { mode: "DEEP" as const, label: "Agent 深度" as const, heading: "AGENT WORKERS · 深度", workers: 6 },
  ]) {
    test(`${scenario.mode.toLowerCase()} mode renders its bounded worker plan and resets the next send`, async ({ page }) => {
      const mock = await installAgentMocks(page, { mode: scenario.mode });
      await submitAgent(page, scenario.label);

      await expect(page.locator("[data-agent-worker-panel]")).toBeVisible();
      await expect(page.getByText(scenario.heading)).toBeVisible();
      await expect(page.getByText(`${scenario.workers}/${scenario.workers} Worker`)).toBeVisible();
      await expect(page.getByText("这是 Leader 的最终回答。")).toBeVisible();
      await expect(page.getByRole("button", { name: "常规", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => mock.getRequestBody()?.mode).toBe(scenario.mode);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("fallback, timeout and failed dependencies remain visible without inventing success", async ({ page }) => {
    await installAgentMocks(page, { mode: "STANDARD", fallback: true, statuses: ["COMPLETE", "COMPLETE", "TIMEOUT", "BLOCKED"] });
    await submitAgent(page, "Agent 标准");

    const panel = page.locator("[data-agent-worker-panel]");
    await expect(panel).toContainText("安全回退计划");
    await expect(panel).toContainText("2 成功");
    await expect(panel.getByText("超时", { exact: true })).toBeVisible();
    await expect(panel.getByText("依赖阻塞", { exact: true })).toBeVisible();
    await expect(page.getByText("这是 Leader 的最终回答。")).toBeVisible();
  });

  test("a Planner failure becomes a terminal safe error without a stale Stop button", async ({ page }) => {
    await page.route("**/api/agents", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: [
          encodeSse("run", { runId: ids.run, conversationId: ids.conversation, conversationUpdatedAt: startedAt, userMessageId: ids.userMessage, assistantMessageId: ids.assistantMessage, startedAt, mode: "STANDARD" }),
          encodeSse("error", { code: "PLANNER_ERROR", message: "Agent 未能完成。" }),
        ].join(""),
      });
    });
    await submitAgent(page, "Agent 标准");
    await expect(page.locator("[data-agent-worker-panel]")).toContainText("失败");
    await expect(page.getByText("本次生成未正常完成")).toBeVisible();
    await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "全部停止" })).toHaveCount(0);
  });

  test("single-worker and global cancellation reconcile through durable status", async ({ page }) => {
    await installAgentMocks(page, { mode: "STANDARD", detached: true, statuses: ["RUNNING", "QUEUED", "QUEUED", "QUEUED"] });
    await submitAgent(page, "Agent 标准");

    const panel = page.locator("[data-agent-worker-panel]");
    await expect(panel).toContainText("后台继续");
    await panel.getByRole("button", { name: "展开全部" }).click();
    await panel.getByRole("button", { name: "停止该 Worker" }).first().click();
    await expect(panel.getByText("已停止", { exact: true }).first()).toBeVisible();

    await panel.getByRole("button", { name: "全部停止" }).click();
    await expect(panel).toContainText("已停止");
    await expect(panel.getByRole("button", { name: "全部停止" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const raw = sessionStorage.getItem("chat-generation-registry");
      if (!raw) return true;
      const entries = Object.values((JSON.parse(raw) as { entries?: Record<string, { agentRunId?: string }> }).entries ?? {});
      return entries.every((entry) => !entry.agentRunId);
    })).toBe(true);
  });

  test("Chat A background Agent does not lock Chat B Composer or change its Stop target", async ({ page }) => {
    await installAgentMocks(page, { mode: "STANDARD", detached: true, statuses: ["RUNNING", "QUEUED", "QUEUED", "QUEUED"] });
    await installCompletedChatMock(page);
    await submitAgent(page, "Agent 标准");
    await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible();

    await page.goto("/chat");
    await expect(page.getByLabel("消息内容")).toBeEditable();
    await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);
    await page.getByLabel("消息内容").fill("Chat B can send independently");
    await page.getByRole("button", { name: "发送消息" }).click();
    await expect(page.getByText("Chat B completed")).toBeVisible();

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible();
    await page.getByRole("button", { name: "停止生成" }).click();
    await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);
  });
});
