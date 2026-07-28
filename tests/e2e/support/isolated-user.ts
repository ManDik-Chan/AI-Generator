import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { expect, type Page, type TestInfo } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

export interface IsolatedE2eUser {
  email: string;
  namespace: string;
  password: string;
  userId: string;
}

function requiredTestEnvironment() {
  const supabaseUrl = process.env.SUPABASE_TEST_URL;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Isolated authenticated E2E requires local Supabase test credentials.");
  }
  if (!/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(supabaseUrl)) {
    throw new Error("Isolated authenticated E2E refuses a non-local Supabase URL.");
  }
  return { serviceRoleKey, supabaseUrl };
}

export async function recordE2eSensitiveValue(value: string) {
  const sensitiveValuesFile = process.env.E2E_SENSITIVE_VALUES_FILE;
  if (!sensitiveValuesFile) return;
  await mkdir(dirname(sensitiveValuesFile), { recursive: true });
  await appendFile(sensitiveValuesFile, `${value}\n`, { encoding: "utf8", mode: 0o600 });
}

export function createE2eNamespace(testInfo: TestInfo, label: string) {
  const project = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  return `${label}-${project}-w${testInfo.workerIndex}-r${testInfo.retry}-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
}

export function e2eBusinessToken(namespace: string, label: string) {
  const prefix = `${label}-`;
  if (!namespace.startsWith(prefix)) {
    throw new Error(`E2E namespace does not belong to ${label}.`);
  }
  const token = namespace.slice(prefix.length).replaceAll("-", "_");
  if (token.length > 40) {
    throw new Error(`E2E business token for ${label} exceeds the Memory keyword limit.`);
  }
  return token;
}

export async function createIsolatedE2eUser(
  page: Page,
  testInfo: TestInfo,
  label: string,
): Promise<IsolatedE2eUser> {
  const { serviceRoleKey, supabaseUrl } = requiredTestEnvironment();
  const namespace = createE2eNamespace(testInfo, label);
  const email = `${namespace}@example.test`;
  const password = `P!${randomUUID()}a9`;
  await Promise.all([recordE2eSensitiveValue(email), recordE2eSensitiveValue(password)]);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`Unable to create isolated E2E user for ${namespace}.`);
  }

  try {
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel("邮箱").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
    await expect(page.locator("body")).toBeVisible();
  } catch (loginError) {
    const cleanupDb = new PrismaClient();
    let cleanupError: unknown;
    try {
      if (!page.isClosed()) await page.close({ runBeforeUnload: false });
      await cleanupDb.profile.deleteMany({ where: { id: created.data.user.id } });
      const deleted = await service.auth.admin.deleteUser(created.data.user.id);
      if (deleted.error) {
        throw new Error(`Unable to clean up failed E2E login for ${namespace}.`);
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      await cleanupDb.$disconnect();
    }
    if (cleanupError) {
      throw new AggregateError(
        [loginError, cleanupError],
        `E2E login and cleanup both failed for ${namespace}.`,
      );
    }
    throw loginError;
  }

  return {
    email,
    namespace,
    password,
    userId: created.data.user.id,
  };
}

export async function cleanupIsolatedE2eUser(
  identity: IsolatedE2eUser,
  db: PrismaClient,
  page: Page,
) {
  const { serviceRoleKey, supabaseUrl } = requiredTestEnvironment();
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const cleanupErrors: unknown[] = [];
  try {
    if (!page.isClosed()) await page.close({ runBeforeUnload: false });
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await db.profile.deleteMany({ where: { id: identity.userId } });
    const remainingProfiles = await db.profile.count({
      where: { id: identity.userId },
    });
    if (remainingProfiles !== 0) {
      throw new Error(`Isolated E2E user ${identity.namespace} left database state behind.`);
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    const deleted = await service.auth.admin.deleteUser(identity.userId);
    if (deleted.error) {
      throw new Error(`Unable to delete isolated E2E user ${identity.namespace}.`);
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  await db.$disconnect();
  if (cleanupErrors.length) {
    throw new AggregateError(
      cleanupErrors,
      `Isolated E2E cleanup failed for ${identity.namespace}.`,
    );
  }
}
