import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { AUTH_PERSISTENCE_COOKIE, isSessionCookie } from "../../../lib/auth/supabase/persistence";
import {
  cleanupIsolatedE2eUser,
  createIsolatedE2eUser,
  isAcceptedLoginTransportEnd,
  recordE2eSensitiveValue,
  waitForRequestSettled,
  type IsolatedE2eUser,
} from "../support/isolated-user";

// Runs in the existing remote browser matrix. Local browser execution remains
// suspended under AGENTS.md; authoring these tests does not grant acceptance.
test.use({ storageState: { cookies: [], origins: [] } });

function requireIsolatedEnvironment(baseURL: string | undefined) {
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  const endpoints = [baseURL, process.env.SUPABASE_TEST_URL, process.env.TEST_DATABASE_URL];
  if (endpoints.some((endpoint) => !endpoint || !loopback.has(new URL(endpoint).hostname))
    || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
    || process.env.ALLOW_TEST_DATABASE_MUTATIONS !== "true"
    || process.env.TEST_DATABASE_CONFIRMED_NON_PRODUCTION !== "true") {
    throw new Error("Auth browser acceptance requires guarded disposable loopback app, Auth and database endpoints.");
  }
}

test.beforeEach(async ({ baseURL }) => {
  requireIsolatedEnvironment(baseURL);
});

const isolatedTest = test.extend<{ identity: IsolatedE2eUser }>({
  identity: async ({ page, baseURL }, provide, testInfo) => {
    requireIsolatedEnvironment(baseURL);
    const identity = await createIsolatedE2eUser(page, testInfo, "auth-session");
    const db = new PrismaClient();
    try {
      await provide(identity);
    } finally {
      // Close every tab using the account before deleting it. The shared CI
      // account is never modified, and the helper registers synthetic secrets
      // with the existing artifact sanitizer.
      for (const tab of page.context().pages()) {
        if (tab !== page) await tab.close({ runBeforeUnload: false });
      }
      await cleanupIsolatedE2eUser(identity, db, page);
    }
  },
});

async function expectWorkspace(page: Page, identity: IsolatedE2eUser) {
  await expect(page).toHaveURL(/\/workspace(?:\?|$)/);
  await expect(page.locator("main").getByText(identity.namespace, { exact: false })).toBeVisible();
}

async function login(page: Page, identity: IsolatedE2eUser, remember: boolean) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("邮箱").fill(identity.email);
  await page.locator("#password").fill(identity.password);
  await page.getByRole("checkbox", { name: "保持登录" }).setChecked(remember);
  const isLoginPost = (request: Request) =>
    new URL(request.url()).pathname === "/login" && request.method() === "POST";
  const responsePromise = page.waitForResponse((response) => isLoginPost(response.request()));
  const settled = waitForRequestSettled(page, isLoginPost, 30_000);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  expect([200, 303], "Login Server Action must succeed.").toContain((await responsePromise).status());
  await expectWorkspace(page, identity);
  expect(isAcceptedLoginTransportEnd(await settled), "Login transport must settle before navigation.").toBe(true);
}

async function recordCookieSecrets(context: BrowserContext) {
  const cookies = await context.cookies();
  await Promise.all(cookies.map(({ value }) => recordE2eSensitiveValue(value)));
  return cookies;
}

test("login and registration expose native password manager form semantics", async ({ page }) => {
  await page.goto("/login?next=%2Faccount");
  const loginForm = page.locator("form").filter({ has: page.locator('input[name="password"]') });
  await expect(loginForm).toHaveAttribute("autocomplete", "on");
  expect(await loginForm.evaluate((form) => (form as HTMLFormElement).method)).toBe("post");
  await expect(page.getByLabel("邮箱")).toHaveAttribute("name", "email");
  await expect(page.getByLabel("邮箱")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("邮箱")).toHaveAttribute("autocomplete", "username");
  await expect(page.locator("#password")).toHaveAttribute("name", "password");
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  await expect(page.locator("#password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.locator("#password")).not.toHaveAttribute("minlength");
  await expect(page.getByRole("checkbox", { name: "保持登录" })).not.toBeChecked();
  await page.getByRole("button", { name: "显示密码", exact: true }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  await expect(page).toHaveURL(/\/login\?/);

  await page.getByRole("link", { name: "注册", exact: true }).click();
  await expect(page.locator('input[name="next"]')).toHaveValue("/account");
  await expect(page.locator("#password")).toHaveAttribute("autocomplete", "new-password");
  await expect(page.locator("#password")).toHaveAttribute("minlength", "8");
  await expect(page.getByLabel("显示名称")).toHaveAttribute("autocomplete", "name");
  await expect(page.getByRole("checkbox", { name: "保持登录" })).toHaveCount(0);
});

isolatedTest("valid sessions restore on refresh, another tab and repeated login navigation", async ({ page, identity }) => {
  await recordCookieSecrets(page.context());
  await page.reload();
  await expectWorkspace(page, identity);
  const another = await page.context().newPage();
  await another.goto("/workspace");
  await expectWorkspace(another, identity);
  for (let navigation = 0; navigation < 2; navigation++) {
    await page.goto("/login?next=%2Faccount");
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "账号与设置", exact: true })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
  }
});

for (const remember of [false, true]) {
  isolatedTest(`${remember ? "remembered" : "browser-session"} login: cookie lifetime and persistent-cookie-only restart simulation`, async ({ browser, page, identity, baseURL }) => {
    if (remember) {
      await page.context().clearCookies();
      await login(page, identity, true);
    }
    const cookies = await recordCookieSecrets(page.context());
    const authCookies = cookies.filter(({ name }) => isSessionCookie(name, process.env.SUPABASE_TEST_URL!));
    expect(authCookies.length, "Successful login must write Supabase session cookies.").toBeGreaterThan(0);
    // Assert metadata only; never print credential-bearing cookie values.
    expect(authCookies.map(({ expires }) => remember ? expires > Date.now() / 1000 : expires === -1)).toEqual(authCookies.map(() => true));
    const preference = cookies.find(({ name }) => name === AUTH_PERSISTENCE_COOKIE);
    expect(preference?.value).toBe(remember ? "persistent" : "session");
    expect(remember ? preference!.expires > Date.now() / 1000 : preference!.expires === -1).toBe(true);

    // A new context carrying only unexpired persistent cookies simulates a
    // browser ending its session. This is not a real profile/process restart;
    // actual Edge/Chrome restore settings and password-save UI need manual QA.
    const restarted = await browser.newContext({
      baseURL,
      storageState: {
        cookies: cookies.filter(({ expires }) => expires > Date.now() / 1000),
        origins: [],
      },
    });
    try {
      const reopenedPage = await restarted.newPage();
      await reopenedPage.goto("/workspace");
      if (remember) {
        await expectWorkspace(reopenedPage, identity);
        await reopenedPage.goto("/login?next=%2Faccount");
        await expect(reopenedPage).toHaveURL(/\/account$/);
      } else {
        await expect(reopenedPage).toHaveURL(/\/login\?next=%2Fworkspace$/);
        await expect(reopenedPage.locator('input[name="password"]')).toBeVisible();
      }
    } finally {
      await restarted.close();
    }
  });
}

isolatedTest("logout clears the session in both tabs and keeps protected routes signed out", async ({ page, identity }) => {
  await page.context().clearCookies();
  await login(page, identity, true);
  await recordCookieSecrets(page.context());
  const another = await page.context().newPage();
  await another.goto("/workspace");
  await expectWorkspace(another, identity);
  await page.goto("/account");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(another).toHaveURL(/\/login$/, { timeout: 10_000 });
  const cookies = await recordCookieSecrets(page.context());
  expect(cookies.some(({ name }) => isSessionCookie(name, process.env.SUPABASE_TEST_URL!))).toBe(false);
  expect(cookies.find(({ name }) => name === AUTH_PERSISTENCE_COOKIE)?.value).toBe("signed-out");
  for (const tab of [page, another]) {
    await tab.goto("/workspace");
    await expect(tab).toHaveURL(/\/login\?next=%2Fworkspace$/);
    await tab.reload();
    await expect(tab.locator('input[name="password"]')).toBeVisible();
  }
});
