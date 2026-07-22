import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

import { agentFixtureIds } from "./fixtures/agent";

export default async function globalSetup(config: FullConfig) {
  const authState = process.env.PLAYWRIGHT_AUTH_STATE;
  const supabaseUrl = process.env.SUPABASE_TEST_URL;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!authState || !supabaseUrl || !serviceRoleKey) {
    throw new Error("Authenticated E2E global setup requires isolated Supabase test configuration.");
  }

  const email = `playwright-${randomUUID()}@example.test`;
  const password = `P!${randomUUID()}a9`;
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Unable to create the isolated authenticated E2E account.");

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.conversation.deleteMany({ where: { id: agentFixtureIds.conversation } });
      await tx.conversation.create({
        data: {
          id: agentFixtureIds.conversation,
          userId: created.data.user.id,
          title: "Playwright Agent fixture",
          messages: {
            create: [
              {
                id: agentFixtureIds.userMessage,
                role: "USER",
                content: "Verify Agent orchestration",
                status: "COMPLETE",
              },
              {
                id: agentFixtureIds.assistantMessage,
                role: "ASSISTANT",
                content: "",
                status: "PENDING",
              },
            ],
          },
        },
      });
    });
  } catch {
    throw new Error("Unable to seed the synthetic Agent E2E conversation.");
  } finally {
    await prisma.$disconnect();
  }

  await mkdir(dirname(authState), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const baseUrl = config.projects[0]?.use.baseURL ?? "http://127.0.0.1:3000";
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("邮箱").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
    await page.context().storageState({ path: authState });
  } finally {
    await browser.close();
  }
}
