import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { expectNoHorizontalOverflow } from "./helpers";

const authState = process.env.PLAYWRIGHT_AUTH_STATE;
const hasAuthState = Boolean(
  authState && (process.env.CI || existsSync(authState)),
);
const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`page: ${error.message}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(
    runtimeErrors.get(page) ?? [],
    "Proposal E2E must not emit console errors or uncaught page errors.",
  ).toEqual([]);
});

async function sendChat(page: import("@playwright/test").Page, message: string) {
  await page.goto("/chat");
  await page.getByLabel("消息内容").fill(message);
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("已收到这条测试消息。").last()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "发送消息" })).toBeVisible();
}

async function waitForProposalRefresh(page: Page) {
  await page.waitForLoadState("networkidle");
}

test.describe("trusted memory proposal workflow", () => {
  test.describe.configure({ retries: 0 });
  test.skip(!hasAuthState, "Set PLAYWRIGHT_AUTH_STATE to an existing signed-in storage state.");

  test("accepts CREATE/UPDATE, edits before accept, rejects, and preserves conflicts", async ({
    page,
  }, testInfo) => {
    const fixture = `Playwright memory ${testInfo.project.name}`;
    await page.goto("/memories");

    const createCard = page.locator("[data-memory-proposal-id]").filter({
      hasText: `${fixture} accept CREATE`,
    });
    await expect(createCard).toBeVisible();
    await createCard.getByRole("button", { name: "接受", exact: true }).click();
    await expect(createCard).toHaveCount(0);
    await waitForProposalRefresh(page);
    await expect(page.getByText(`${fixture} accept CREATE`, { exact: true })).toBeVisible();

    const updateCard = page.locator("[data-memory-proposal-id]").filter({
      hasText: `${fixture} accepted UPDATE`,
    });
    await expect(updateCard.getByText(`${fixture} current UPDATE`, { exact: true })).toBeVisible();
    await updateCard.getByRole("button", { name: "接受", exact: true }).click();
    await expect(updateCard).toHaveCount(0);
    await waitForProposalRefresh(page);
    await expect(page.getByText(`${fixture} accepted UPDATE`, { exact: true })).toBeVisible();

    const editCard = page.locator("[data-memory-proposal-id]").filter({
      hasText: `${fixture} edit CREATE`,
    });
    await editCard.getByRole("button", { name: "编辑后接受" }).click();
    const editDialog = page.getByRole("dialog", { name: "编辑建议后接受" });
    const editedContent = `${fixture} edited and accepted`;
    await editDialog.getByLabel("记忆内容").fill(editedContent);
    await editDialog.getByRole("button", { name: "验证并接受" }).click();
    await expect(editCard).toHaveCount(0);
    await waitForProposalRefresh(page);
    await expect(page.getByText(editedContent, { exact: true })).toBeVisible();

    const rejectCard = page.locator("[data-memory-proposal-id]").filter({
      hasText: `${fixture} reject CREATE`,
    });
    await rejectCard.getByRole("button", { name: "拒绝" }).click();
    await expect(rejectCard).toHaveCount(0);
    await waitForProposalRefresh(page);

    const conflictCard = page.locator("[data-memory-proposal-id]").filter({
      hasText: `${fixture} proposed CONFLICT`,
    });
    await expect(conflictCard).toBeVisible();
    await expect(conflictCard.getByRole("button", { name: "接受", exact: true })).toBeDisabled();
    await expect(conflictCard.getByText("目标记忆已被编辑或停用")).toBeVisible();
    await expect(conflictCard.getByText(
      `${fixture} current CONFLICT changed after proposal`,
      { exact: true },
    )).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("runs deterministic Chat → extraction → Proposal → resolution against real data", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const db = new PrismaClient();
    const token = testInfo.project.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    try {
      const profile = await db.profile.findFirst({
        where: { email: { startsWith: "playwright-" } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      expect(profile).not.toBeNull();
      const userId = profile!.id;
      const initialMemoryCount = await db.memory.count({ where: { userId } });
      const initialEmbeddingCount = await db.memoryEmbedding.count({
        where: { memory: { userId } },
      });

      await sendChat(
        page,
        `我终于记住了：E2E_IMPLICIT:${token} 是稳定偏好，但这不是保存命令。`,
      );
      const implicitContent = `E2E implicit fact ${token}`;
      await expect.poll(
        () => db.memoryProposal.count({
          where: { userId, content: implicitContent, status: "PENDING" },
        }),
        { timeout: 30_000 },
      ).toBe(1);
      expect(await db.memory.count({ where: { userId } })).toBe(initialMemoryCount);
      expect(await db.memoryEmbedding.count({
        where: { memory: { userId } },
      })).toBe(initialEmbeddingCount);
      expect(await db.memory.findFirst({
        where: { userId, content: implicitContent },
      })).toBeNull();

      await page.goto("/memories");
      const implicitCard = page.locator("[data-memory-proposal-id]").filter({
        hasText: implicitContent,
      });
      await expect(implicitCard).toBeVisible();
      await implicitCard.getByRole("button", { name: "接受", exact: true }).click();
      await expect(implicitCard).toHaveCount(0);
      await waitForProposalRefresh(page);
      await expect(page.getByText(implicitContent, { exact: true })).toBeVisible();
      const acceptedMemory = await expect.poll(
        () => db.memory.findFirst({
          where: { userId, content: implicitContent },
          select: { id: true },
        }),
        { timeout: 30_000 },
      ).not.toBeNull();
      void acceptedMemory;
      const accepted = await db.memory.findFirstOrThrow({
        where: { userId, content: implicitContent },
        select: { id: true },
      });
      await expect.poll(
        () => db.memoryEmbedding.count({ where: { memoryId: accepted.id } }),
        { timeout: 30_000 },
      ).toBe(1);

      await sendChat(page, `E2E_UPDATE:${token} 现在是更新后的稳定偏好。`);
      const updateContent = `E2E updated fact ${token}`;
      await expect.poll(
        () => db.memoryProposal.count({
          where: { userId, content: updateContent, action: "UPDATE", status: "PENDING" },
        }),
        { timeout: 30_000 },
      ).toBe(1);
      await page.goto("/memories");
      const updateCard = page.locator("[data-memory-proposal-id]").filter({
        hasText: updateContent,
      });
      await updateCard.getByRole("button", { name: "接受", exact: true }).click();
      await expect(updateCard).toHaveCount(0);
      await expect.poll(
        () => db.memory.count({ where: { userId, content: updateContent } }),
      ).toBe(1);
      await waitForProposalRefresh(page);
      await expect(page.getByText(updateContent, { exact: true })).toBeVisible();

      await sendChat(page, `E2E_EDIT:${token} 是需要编辑后确认的稳定事实。`);
      const editContent = `E2E edit candidate ${token}`;
      await expect.poll(
        () => db.memoryProposal.count({
          where: { userId, content: editContent, status: "PENDING" },
        }),
      ).toBe(1);
      await page.goto("/memories");
      const editCard = page.locator("[data-memory-proposal-id]").filter({
        hasText: editContent,
      });
      await editCard.getByRole("button", { name: "编辑后接受" }).click();
      const editDialog = page.getByRole("dialog", { name: "编辑建议后接受" });
      const editedContent = `E2E edited final ${token}`;
      await editDialog.getByLabel("记忆内容").fill(editedContent);
      await editDialog.getByRole("button", { name: "验证并接受" }).click();
      await expect(editCard).toHaveCount(0);
      await expect.poll(
        () => db.memory.count({ where: { userId, content: editedContent } }),
      ).toBe(1);
      await waitForProposalRefresh(page);
      await expect(page.getByText(editedContent, { exact: true })).toBeVisible();

      await sendChat(page, `E2E_REJECT:${token} 是待拒绝的稳定事实。`);
      const rejectContent = `E2E reject candidate ${token}`;
      await expect.poll(
        () => db.memoryProposal.count({
          where: { userId, content: rejectContent, status: "PENDING" },
        }),
      ).toBe(1);
      await page.goto("/memories");
      const rejectCard = page.locator("[data-memory-proposal-id]").filter({
        hasText: rejectContent,
      });
      await rejectCard.getByRole("button", { name: "拒绝" }).click();
      await expect(rejectCard).toHaveCount(0);
      expect(await db.memory.count({ where: { userId, content: rejectContent } })).toBe(0);
      await waitForProposalRefresh(page);

      await sendChat(page, `E2E_CONFLICT:${token} 是目标变更后的稳定事实。`);
      const conflictContent = `E2E conflict candidate ${token}`;
      const conflictProposal = await expect.poll(
        () => db.memoryProposal.findFirst({
          where: { userId, content: conflictContent, status: "PENDING" },
          select: { id: true, targetMemoryId: true },
        }),
        { timeout: 30_000 },
      ).not.toBeNull();
      void conflictProposal;
      const conflict = await db.memoryProposal.findFirstOrThrow({
        where: { userId, content: conflictContent, status: "PENDING" },
        select: { id: true, targetMemoryId: true },
      });
      await page.goto("/memories");
      const liveConflictCard = page.locator(
        `[data-memory-proposal-id="${conflict.id}"]`,
      );
      await expect(liveConflictCard).toBeVisible();
      await db.memory.update({
        where: { id: conflict.targetMemoryId! },
        data: {
          content: `E2E conflict manually changed ${token}`,
        },
      });
      await liveConflictCard.getByRole("button", { name: "接受", exact: true }).click();
      await expect(liveConflictCard.getByText("原记忆已发生变化")).toBeVisible();
      await expect(liveConflictCard).toBeVisible();

      await sendChat(page, `E2E_EXPIRED:${token} 是将被模拟老化的稳定事实。`);
      const expiredContent = `E2E expired candidate ${token}`;
      const expired = await expect.poll(
        () => db.memoryProposal.findFirst({
          where: { userId, content: expiredContent, status: "PENDING" },
          select: { id: true },
        }),
        { timeout: 30_000 },
      ).not.toBeNull();
      void expired;
      const expiredProposal = await db.memoryProposal.findFirstOrThrow({
        where: { userId, content: expiredContent, status: "PENDING" },
        select: { id: true },
      });
      await page.goto("/memories");
      const expiredCard = page.locator(
        `[data-memory-proposal-id="${expiredProposal.id}"]`,
      );
      const past = new Date(Date.now() - 31 * 86_400_000);
      await db.memoryProposal.update({
        where: { id: expiredProposal.id },
        data: {
          createdAt: past,
          expiresAt: new Date(past.getTime() + 30 * 86_400_000),
        },
      });
      await expiredCard.getByRole("button", { name: "接受", exact: true }).click();
      await expect(expiredCard).toHaveCount(0);
      expect(await db.memoryProposal.findUnique({
        where: { id: expiredProposal.id },
        select: { status: true },
      })).toEqual({ status: "EXPIRED" });
      await waitForProposalRefresh(page);

      await page.goto("/memories");
      await page.getByRole("button", { name: "记忆已开启" }).click();
      await expect(page.getByRole("button", { name: "记忆已关闭" })).toBeVisible();
      await sendChat(page, `E2E_DISABLED:${token} 在关闭状态下不得提取。`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(await db.memoryProposal.count({
        where: { userId, content: `E2E disabled candidate ${token}` },
      })).toBe(0);
      await page.goto("/memories");
      await page.getByRole("button", { name: "记忆已关闭" }).click();
      await expect(page.getByRole("button", { name: "记忆已开启" })).toBeVisible();

      await sendChat(page, `请记住：E2E_EXPLICIT:${token} 是明确命令式稳定事实。`);
      await expect.poll(
        () => db.memory.count({
          where: { userId, content: `E2E explicit fact ${token}` },
        }),
        { timeout: 30_000 },
      ).toBe(1);
      expect(await db.memoryProposal.count({
        where: { userId, content: `E2E explicit fact ${token}` },
      })).toBe(0);

      for (const width of [390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
        await page.goto("/memories");
        await expectNoHorizontalOverflow(page);
      }
    } finally {
      await db.$disconnect();
    }
  });
});
