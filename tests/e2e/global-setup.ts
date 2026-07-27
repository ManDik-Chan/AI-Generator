import { createHash, randomUUID } from "node:crypto";
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

      for (const project of config.projects) {
        const fixture = `Playwright memory ${project.name}`;
        const chatToken = project.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
        const proposalNow = new Date();
        const dedupeKey = (caseName: string) => createHash("sha256")
          .update(`${project.name}:${caseName}`)
          .digest("hex");
        const common = {
          userId: created.data.user.id,
          status: "PENDING" as const,
          category: "preference",
          scope: "GLOBAL" as const,
          importance: 4,
          confidence: 0.96,
          reasonCode: "preference",
          sourceConversationId: agentFixtureIds.conversation,
          sourceMessageId: agentFixtureIds.userMessage,
          createdAt: proposalNow,
          updatedAt: proposalNow,
          expiresAt: new Date(proposalNow.getTime() + 30 * 86_400_000),
        };
        await tx.memoryProposal.createMany({
          data: [
            {
              ...common,
              action: "CREATE",
              content: `${fixture} accept CREATE`,
              topicKey: `e2e.${project.name}.accept`.replace(/[^a-z0-9._-]/g, "_"),
              keywords: ["E2E", "accept"],
              dedupeKey: dedupeKey("accept"),
              suppressionKey: dedupeKey("accept-suppression"),
            },
            {
              ...common,
              action: "CREATE",
              content: `${fixture} edit CREATE`,
              topicKey: `e2e.${project.name}.edit`.replace(/[^a-z0-9._-]/g, "_"),
              keywords: ["E2E", "edit"],
              dedupeKey: dedupeKey("edit"),
              suppressionKey: dedupeKey("edit-suppression"),
            },
            {
              ...common,
              action: "CREATE",
              content: `${fixture} reject CREATE`,
              topicKey: `e2e.${project.name}.reject`.replace(/[^a-z0-9._-]/g, "_"),
              keywords: ["E2E", "reject"],
              dedupeKey: dedupeKey("reject"),
              suppressionKey: dedupeKey("reject-suppression"),
            },
          ],
        });

        const updateTarget = await tx.memory.create({
          data: {
            userId: created.data.user.id,
            content: `${fixture} current UPDATE`,
            category: "preference",
            scope: "GLOBAL",
            verificationMethod: "MANUAL_ENTRY",
            verifiedAt: proposalNow,
            importance: 3,
            topicKey: `e2e.${project.name}.update`.replace(/[^a-z0-9._-]/g, "_"),
          },
          select: { id: true, updatedAt: true, revision: true },
        });
        await tx.memoryProposal.create({
          data: {
            ...common,
            action: "UPDATE",
            targetMemoryId: updateTarget.id,
            targetMemoryUpdatedAt: updateTarget.updatedAt,
            targetMemoryRevision: updateTarget.revision,
            content: `${fixture} accepted UPDATE`,
            topicKey: `e2e.${project.name}.update`.replace(/[^a-z0-9._-]/g, "_"),
            keywords: ["E2E", "update"],
            dedupeKey: dedupeKey("update"),
            suppressionKey: dedupeKey("update-suppression"),
          },
        });

        const conflictTarget = await tx.memory.create({
          data: {
            userId: created.data.user.id,
            content: `${fixture} current CONFLICT`,
            category: "preference",
            scope: "GLOBAL",
            verificationMethod: "MANUAL_ENTRY",
            verifiedAt: proposalNow,
            importance: 3,
            topicKey: `e2e.${project.name}.conflict`.replace(/[^a-z0-9._-]/g, "_"),
          },
          select: { id: true, updatedAt: true, revision: true },
        });
        await tx.memoryProposal.create({
          data: {
            ...common,
            action: "UPDATE",
            targetMemoryId: conflictTarget.id,
            targetMemoryUpdatedAt: conflictTarget.updatedAt,
            targetMemoryRevision: conflictTarget.revision,
            content: `${fixture} proposed CONFLICT`,
            topicKey: `e2e.${project.name}.conflict`.replace(/[^a-z0-9._-]/g, "_"),
            keywords: ["E2E", "conflict"],
            dedupeKey: dedupeKey("conflict"),
            suppressionKey: dedupeKey("conflict-suppression"),
          },
        });
        await tx.memory.update({
          where: { id: conflictTarget.id },
          data: {
            content: `${fixture} current CONFLICT changed after proposal`,
          },
        });
        await tx.memory.createMany({
          data: [
            {
              userId: created.data.user.id,
              content: `E2E update target ${chatToken}`,
              category: "preference",
              scope: "GLOBAL",
              verificationMethod: "MANUAL_ENTRY",
              verifiedAt: proposalNow,
              importance: 3,
              topicKey: `e2e.chat.${chatToken}.update`,
            },
            {
              userId: created.data.user.id,
              content: `E2E conflict target ${chatToken}`,
              category: "preference",
              scope: "GLOBAL",
              verificationMethod: "MANUAL_ENTRY",
              verifiedAt: proposalNow,
              importance: 3,
              topicKey: `e2e.chat.${chatToken}.conflict`,
            },
          ],
        });
      }
    });
  } catch {
    throw new Error("Unable to seed the synthetic Agent and memory E2E fixtures.");
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
