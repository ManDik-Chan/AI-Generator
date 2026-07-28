import { expect, type Page, type Request } from "@playwright/test";
import { PrismaClient, type MessageStatus } from "@prisma/client";

function isChatPost(url: string, method: string) {
  return method === "POST" && new URL(url).pathname === "/api/chat";
}

function isChatBootstrap(url: string, method: string) {
  return method === "GET" && new URL(url).pathname === "/api/chat/bootstrap";
}

function isMemoryServerAction(url: string, method: string, headers: Record<string, string>) {
  return method === "POST"
    && new URL(url).pathname === "/memories"
    && Boolean(headers["next-action"]);
}

export async function runAndWaitForMemoryServerAction(
  page: Page,
  action: () => Promise<void>,
) {
  const responsePromise = page.waitForResponse(
    (response) => isMemoryServerAction(
      response.url(),
      response.request().method(),
      response.request().headers(),
    ),
    { timeout: 30_000 },
  );
  await action();
  const response = await responsePromise;
  expect(response.status(), "Memory Server Action must complete successfully.").toBe(200);
  return response;
}

export async function waitForReadyChatNavigation(
  page: Page,
  action: () => Promise<unknown>,
) {
  const bootstrapResponsePromise = page.waitForResponse(
    (response) => isChatBootstrap(response.url(), response.request().method()),
    { timeout: 30_000 },
  );
  await action();
  const bootstrapResponse = await bootstrapResponsePromise;
  expect(
    bootstrapResponse.status(),
    "Chat bootstrap must authenticate and load before the test changes route.",
  ).toBe(200);
  expect(
    await bootstrapResponse.finished(),
    "Chat bootstrap transport must finish before the test changes route.",
  ).toBeNull();
}

export async function runAndWaitForChatTransport(
  page: Page,
  action: () => Promise<void>,
) {
  const responsePromise = page.waitForResponse(
    (response) => isChatPost(response.url(), response.request().method()),
    { timeout: 30_000 },
  );
  const finishedPromise = page.waitForEvent("requestfinished", {
    predicate: (request) => isChatPost(request.url(), request.method()),
    timeout: 30_000,
  });
  await action();
  const response = await responsePromise;
  expect(response.status(), "Chat streaming endpoint must accept the request.").toBe(200);
  const finishedRequest = await finishedPromise;
  expect(finishedRequest.failure(), "Chat streaming transport must finish cleanly.").toBeNull();
  return response;
}

export function observeRequestTerminal(page: Page, targetRequest: Request) {
  return new Promise<{ failure: string | null; state: "failed" | "finished" }>((resolve) => {
    const cleanup = () => {
      page.off("requestfailed", onFailed);
      page.off("requestfinished", onFinished);
    };
    const onFailed = (request: Request) => {
      if (request !== targetRequest) return;
      cleanup();
      resolve({
        failure: request.failure()?.errorText ?? "unknown",
        state: "failed",
      });
    };
    const onFinished = (request: Request) => {
      if (request !== targetRequest) return;
      cleanup();
      resolve({ failure: null, state: "finished" });
    };
    page.on("requestfailed", onFailed);
    page.on("requestfinished", onFinished);
  });
}

export async function waitForAssistantMessageStatus(
  db: PrismaClient,
  userId: string,
  userContent: string,
  expectedStatus: MessageStatus,
) {
  const userMessage = await expect.poll(
    () => db.message.findFirst({
      where: {
        role: "USER",
        content: userContent,
        conversation: { userId },
      },
      orderBy: { createdAt: "desc" },
      select: {
        conversationId: true,
        createdAt: true,
      },
    }),
    { timeout: 30_000 },
  ).not.toBeNull();
  void userMessage;

  const persistedUserMessage = await db.message.findFirstOrThrow({
    where: {
      role: "USER",
      content: userContent,
      conversation: { userId },
    },
    orderBy: { createdAt: "desc" },
    select: {
      conversationId: true,
      createdAt: true,
    },
  });
  await expect.poll(
    () => db.message.findFirst({
      where: {
        conversationId: persistedUserMessage.conversationId,
        role: "ASSISTANT",
        createdAt: { gte: persistedUserMessage.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    { timeout: 30_000 },
  ).toEqual({ status: expectedStatus });
}

export async function sendChatAndWaitForCompletion(
  page: Page,
  db: PrismaClient,
  userId: string,
  message: string,
  expectedResponse = "已收到这条测试消息。",
) {
  await waitForReadyChatNavigation(
    page,
    () => page.goto("/chat", { waitUntil: "domcontentloaded" }),
  );
  const composer = page.getByLabel("消息内容");
  await expect(composer).toBeVisible();
  await composer.fill(message);
  await runAndWaitForChatTransport(page, async () => {
    await page.getByRole("button", { name: "发送消息" }).click();
  });
  await expect(page.getByText(expectedResponse, { exact: true }).last()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0, {
    timeout: 30_000,
  });
  await waitForAssistantMessageStatus(db, userId, message, "COMPLETE");
}
