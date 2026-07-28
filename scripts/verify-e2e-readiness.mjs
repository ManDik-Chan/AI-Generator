import { setTimeout as delay } from "node:timers/promises";

import { PrismaClient } from "@prisma/client";

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const mockBaseUrl = process.env.MOCK_AI_BASE_URL ?? "http://127.0.0.1:4319";
const deadlineMs = 60_000;

function assertLocalUrl(value, label, protocols) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`${label} must use an isolated local URL.`);
  }
}

assertLocalUrl(appBaseUrl, "Playwright application", ["http:"]);
assertLocalUrl(mockBaseUrl, "Mock AI Provider", ["http:"]);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for E2E readiness.");
assertLocalUrl(process.env.DATABASE_URL, "E2E database", ["postgres:", "postgresql:"]);

async function poll(label, probe) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < deadlineMs) {
    try {
      await probe();
      process.stdout.write(`e2e_readiness_ok service=${label}\n`);
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`${label} did not become ready: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

await poll("mock-health-and-completion", async () => {
  const health = await fetch(`${mockBaseUrl}/health`, {
    signal: AbortSignal.timeout(2_000),
  });
  if (health.status !== 200 || (await health.text()) !== "ok") {
    throw new Error(`health returned ${health.status}`);
  }
  const completion = await fetch(`${mockBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "readiness",
      messages: [{ role: "user", content: "E2E_READINESS" }],
    }),
    signal: AbortSignal.timeout(2_000),
  });
  const body = await completion.text();
  if (completion.status !== 200 || !body.includes("data: [DONE]")) {
    throw new Error(`completion returned ${completion.status}`);
  }
});

const prisma = new PrismaClient();
try {
  await poll("prisma-database", async () => {
    const result = await prisma.$queryRaw`SELECT 1 AS ready`;
    if (!Array.isArray(result) || result.length !== 1) {
      throw new Error("database probe returned an unexpected result");
    }
  });
} finally {
  await prisma.$disconnect();
}

await poll("next-ssr", async () => {
  const response = await fetch(`${appBaseUrl}/login`, {
    redirect: "manual",
    signal: AbortSignal.timeout(3_000),
  });
  const body = await response.text();
  if (response.status !== 200 || !body.includes('id="password"')) {
    throw new Error(`login SSR returned ${response.status}`);
  }
});
