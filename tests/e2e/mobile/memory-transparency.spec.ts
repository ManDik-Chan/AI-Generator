import { randomUUID, createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { expectNoHorizontalOverflow } from "./helpers";
import {
  observeRequestTerminal,
  runAndWaitForChatTransport,
  runAndWaitForMemoryServerAction,
  sendChatAndWaitForCompletion,
  waitForReadyChatNavigation,
  waitForAssistantMessageStatus,
} from "../support/chat-terminal";
import {
  cleanupIsolatedE2eUser,
  createIsolatedE2eUser,
} from "../support/isolated-user";
import {
  attachRuntimeDiagnostics,
  expectNoRuntimeErrors,
  installRuntimeDiagnostics,
  type RuntimeDiagnostics,
} from "../support/runtime-diagnostics";

const supabaseUrl = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const configured = Boolean(supabaseUrl && serviceRoleKey);
const runtimeDiagnostics = new WeakMap<Page, RuntimeDiagnostics>();

function assertNoRuntimeErrors(page: Page, stage: string) {
  const diagnostics = runtimeDiagnostics.get(page) ?? {
    errors: ["Runtime diagnostics were not installed."],
    requestFailures: [],
  };
  expectNoRuntimeErrors(
    diagnostics,
    `Memory transparency E2E emitted an error during ${stage}.`,
  );
}

test.beforeEach(async ({ page }) => {
  runtimeDiagnostics.set(page, installRuntimeDiagnostics(page));
});

test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = runtimeDiagnostics.get(page) ?? {
    errors: ["Runtime diagnostics were not installed."],
    requestFailures: [],
  };
  await attachRuntimeDiagnostics(testInfo, diagnostics);
  assertNoRuntimeErrors(page, "the completed scenario");
});

async function sendChat(
  page: Page,
  db: PrismaClient,
  userId: string,
  message: string,
  expectedResponse = "已收到这条测试消息。",
) {
  await sendChatAndWaitForCompletion(
    page,
    db,
    userId,
    message,
    expectedResponse,
  );
}

test.describe("memory provenance and live turn disclosure", () => {
  test.describe.configure({ retries: 0 });
  test.skip(!configured, "Requires isolated local Supabase test credentials.");

  test("shows exact selected memories, legacy review, disabled/zero boundaries, and responsive layouts", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const db = new PrismaClient();
    const identity = await createIsolatedE2eUser(page, testInfo, "transparency");
    const token = identity.namespace;
    const legacyToken = `legacy${randomUUID().replaceAll("-", "")}`;
    const userId = identity.userId;

    try {
      const now = new Date();
      const disclosureA = `${token} alpha verified memory`;
      const disclosureB = `${token} beta verified memory`;
      const pendingContent = `${token} pending proposal must stay hidden`;
      const legacyContent = `${legacyToken} old automatic memory`;
      const disabledContent = `${token} disabled formal memory`;
      const personaContent = `${token} foreign Persona memory`;

      const persona = await db.persona.create({
        data: {
          userId,
          name: `${token} Persona`,
          personality: "fixture",
          systemPrompt: "fixture",
        },
      });
      const sourceConversation = await db.conversation.create({
        data: { userId, title: `${token} proposal source` },
      });
      const sourceMessage = await db.message.create({
        data: {
          conversationId: sourceConversation.id,
          role: "USER",
          status: "COMPLETE",
          content: pendingContent,
        },
      });
      await db.memory.createMany({
        data: [
          {
            userId,
            content: disclosureA,
            category: "preference",
            scope: "GLOBAL",
            importance: 3,
            verificationMethod: "MANUAL_ENTRY",
            verifiedAt: now,
          },
          {
            userId,
            content: disclosureB,
            category: "profile",
            scope: "GLOBAL",
            importance: 3,
            origin: "CHAT_MESSAGE",
            verificationMethod: "EXPLICIT_REQUEST",
            verifiedAt: now,
          },
          {
            userId,
            content: legacyContent,
            category: "preference",
            scope: "GLOBAL",
            importance: 3,
            origin: "AUTO_EXTRACTED",
            verificationMethod: "LEGACY_UNREVIEWED",
            verifiedAt: null,
          },
          {
            userId,
            content: disabledContent,
            category: "preference",
            scope: "GLOBAL",
            importance: 5,
            enabled: false,
            verificationMethod: "MANUAL_ENTRY",
            verifiedAt: now,
          },
          {
            userId,
            personaId: persona.id,
            content: personaContent,
            category: "preference",
            scope: "PERSONA",
            importance: 5,
            verificationMethod: "MANUAL_ENTRY",
            verifiedAt: now,
          },
        ],
      });
      const proposalCreatedAt = new Date(Date.now() - 1_000);
      await db.memoryProposal.create({
        data: {
          userId,
          action: "CREATE",
          status: "PENDING",
          content: pendingContent,
          category: "preference",
          scope: "GLOBAL",
          importance: 5,
          confidence: 0.99,
          reasonCode: "preference",
          sourceConversationId: sourceConversation.id,
          sourceMessageId: sourceMessage.id,
          dedupeKey: createHash("sha256")
            .update(`${token}:pending:dedupe`)
            .digest("hex"),
          suppressionKey: createHash("sha256")
            .update(`${token}:pending:suppression`)
            .digest("hex"),
          createdAt: proposalCreatedAt,
          updatedAt: proposalCreatedAt,
          expiresAt: new Date(
            proposalCreatedAt.getTime() + 30 * 86_400_000,
          ),
        },
      });

      const promptAudit = `PROMPT_MEMORY_CONTENTS=${encodeURIComponent(
        JSON.stringify([disclosureA, disclosureB].sort()),
      )}`;
      await sendChat(
        page,
        db,
        userId,
        `E2E_PROMPT_AUDIT 请说明 ${token} alpha beta`,
        promptAudit,
      );
      const assistant = page.locator("article").filter({
        hasText: promptAudit,
      }).last();
      const disclosureSummary = assistant.getByText(
        "本轮参考了 2 条已确认记忆",
        { exact: true },
      );
      await expect(disclosureSummary).toBeVisible();
      await disclosureSummary.click();
      await expect(assistant.getByText(disclosureA, { exact: true })).toBeVisible();
      await expect(assistant.getByText(disclosureB, { exact: true })).toBeVisible();
      await expect(assistant.getByText(pendingContent, { exact: true })).toHaveCount(0);
      await expect(assistant.getByText(disabledContent, { exact: true })).toHaveCount(0);
      await expect(assistant.getByText(personaContent, { exact: true })).toHaveCount(0);
      await expect(assistant.getByText("用户手动添加", { exact: true })).toBeVisible();
      await expect(assistant.getByText("用户明确要求记住", { exact: true })).toBeVisible();

      const actuallyUsed = await db.memory.findMany({
        where: { userId, useCount: { gt: 0 } },
        orderBy: { content: "asc" },
        select: { content: true },
      });
      expect(actuallyUsed.map((memory) => memory.content).sort()).toEqual(
        [disclosureA, disclosureB].sort(),
      );
      assertNoRuntimeErrors(page, "successful disclosure");

      const providerFailureMessage = `E2E_PROVIDER_FAIL ${token} alpha beta`;
      await page.getByLabel("消息内容").fill(providerFailureMessage);
      await runAndWaitForChatTransport(page, async () => {
        await page.getByRole("button", { name: "发送消息" }).click();
      });
      const failedAssistant = page.locator("article").filter({
        hasText: "本次生成未正常完成",
      }).last();
      await expect(failedAssistant).toBeVisible({ timeout: 30_000 });
      await expect(failedAssistant.getByText(
        /本轮参考了 \d+ 条/,
      )).toHaveCount(0);
      await waitForAssistantMessageStatus(
        db,
        userId,
        providerFailureMessage,
        "ERROR",
      );
      assertNoRuntimeErrors(page, "Provider failure");

      const cancelledMessage = `E2E_PROVIDER_SLOW ${token} alpha beta`;
      await page.getByLabel("消息内容").fill(cancelledMessage);
      const slowResponsePromise = page.waitForResponse(
        (response) => response.request().method() === "POST"
          && new URL(response.url()).pathname === "/api/chat",
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "发送消息" }).click();
      const slowResponse = await slowResponsePromise;
      expect(slowResponse.status()).toBe(200);
      const slowRequestTerminal = observeRequestTerminal(
        page,
        slowResponse.request(),
      );
      const slowAssistant = page.locator("main article").last();
      const stopButton = page.getByRole(
        "button",
        { name: "停止生成", exact: true },
      );
      await expect(stopButton).toBeVisible({ timeout: 30_000 });
      const cancelResponsePromise = page.waitForResponse(
        (response) => response.request().method() === "POST"
          && /\/api\/chat\/messages\/[^/]+\/cancel$/.test(new URL(response.url()).pathname),
        { timeout: 30_000 },
      );
      await stopButton.click();
      const cancelResponse = await cancelResponsePromise;
      expect(cancelResponse.status()).toBe(200);
      await expect(page.getByRole(
        "button",
        { name: "停止生成", exact: true },
      )).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(slowAssistant.getByText(
        /本轮参考了 \d+ 条/,
      )).toHaveCount(0);
      expect(await slowRequestTerminal).toEqual({
        failure: expect.anything(),
        state: "failed",
      });
      await waitForAssistantMessageStatus(
        db,
        userId,
        cancelledMessage,
        "CANCELLED",
      );
      assertNoRuntimeErrors(page, "user cancellation");
      const useCountsAfterUnsuccessfulTurns = await db.memory.findMany({
        where: { userId, useCount: { gt: 0 } },
        orderBy: { content: "asc" },
        select: { content: true, useCount: true },
      });
      expect(useCountsAfterUnsuccessfulTurns).toEqual(
        [disclosureA, disclosureB]
          .sort()
          .map((content) => ({ content, useCount: 1 })),
      );

      await waitForReadyChatNavigation(
        page,
        () => page.reload({ waitUntil: "domcontentloaded" }),
      );
      await expect(page.getByLabel("消息内容")).toBeVisible();
      await expect(page.getByText(
        "本轮参考了 2 条已确认记忆",
        { exact: true },
      )).toHaveCount(0);

      await sendChat(page, db, userId, `请说明 ${legacyToken}`);
      const legacyAssistant = page.locator("article").filter({
        hasText: "已收到这条测试消息。",
      }).last();
      const legacySummary = legacyAssistant.getByText(
        "本轮参考了 1 条正式记忆（含旧版未复核）",
        { exact: true },
      );
      await expect(legacySummary).toBeVisible();
      await legacySummary.click();
      await expect(legacyAssistant.getByText(
        "旧版自动整理，尚未复核",
        { exact: true },
      )).toBeVisible();
      await expect(legacyAssistant.getByText(
        /不代表用户已确认/,
      )).toBeVisible();

      await page.goto("/memories");
      await expect(page.getByText(
        "内容来源：用户录入",
        { exact: true },
      ).first()).toBeVisible();
      await expect(page.getByText(
        "内容来源：聊天消息",
        { exact: true },
      ).first()).toBeVisible();
      await expect(page.getByText(
        "内容来源：AI 对话整理",
        { exact: true },
      ).first()).toBeVisible();
      await runAndWaitForMemoryServerAction(page, async () => {
        await page.getByRole("button", { name: "记忆已开启" }).click();
      });
      await expect(page.getByRole("button", { name: "记忆已关闭" })).toBeVisible();
      await expect(page.getByRole("button", { name: "记忆已关闭" })).toBeEnabled();
      await sendChat(page, db, userId, `请说明 ${token} alpha beta`);
      await expect(page.getByText(/本轮参考了 \d+ 条/)).toHaveCount(0);

      await page.goto("/memories");
      await runAndWaitForMemoryServerAction(page, async () => {
        await page.getByRole("button", { name: "记忆已关闭" }).click();
      });
      await expect(page.getByRole("button", { name: "记忆已开启" })).toBeVisible();
      await expect(page.getByRole("button", { name: "记忆已开启" })).toBeEnabled();
      await db.memory.updateMany({
        where: { userId },
        data: { enabled: false },
      });
      await sendChat(page, db, userId, `zero-${token}`);
      await expect(page.getByText(/本轮参考了 \d+ 条/)).toHaveCount(0);

      await db.memory.update({
        where: {
          id: (await db.memory.findFirstOrThrow({
            where: { userId, content: legacyContent },
            select: { id: true },
          })).id,
        },
        data: { enabled: true },
      });
      await page.goto("/memories");
      const legacyCard = page.locator("article").filter({
        hasText: legacyContent,
      });
      await expect(legacyCard.getByText(
        "旧版自动整理，尚未复核",
        { exact: true },
      )).toBeVisible();
      await runAndWaitForMemoryServerAction(page, async () => {
        await legacyCard.getByRole("button", { name: "标记为已核对" }).click();
      });
      await expect(legacyCard.getByText(
        "用户已手动核对",
        { exact: true },
      )).toBeVisible();
      await expect(legacyCard.getByRole(
        "button",
        { name: "标记为已核对" },
      )).toHaveCount(0);
      expect(await db.memory.findFirst({
        where: { userId, content: legacyContent },
        select: { verificationMethod: true, verifiedAt: true },
      })).toEqual({
        verificationMethod: "MANUAL_REVIEW",
        verifiedAt: expect.any(Date),
      });

      await page.goto("/memories", { waitUntil: "domcontentloaded" });
      for (const width of [390, 430, 768, 1440]) {
        await page.setViewportSize({
          width,
          height: width < 700 ? 844 : 1000,
        });
        await expectNoHorizontalOverflow(page);
      }
    } finally {
      await cleanupIsolatedE2eUser(identity, db, page);
    }
  });
});
