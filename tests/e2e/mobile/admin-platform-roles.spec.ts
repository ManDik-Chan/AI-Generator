import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type APIResponse, type Page, type Request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import {
  cleanupIsolatedE2eUser,
  createIsolatedE2eAccount,
  createIsolatedE2eUser,
  type IsolatedE2eUser,
} from "../support/isolated-user";

/*
 * /admin platform roles on the production build, end to end: the OWNER changes roles through
 * the page's real Server Action over HTTP, while an ADMIN, a just-demoted ADMIN and a signed-out
 * client send crafted Server Action requests that the server must refuse. Every outcome is
 * checked against the database, not only the screen.
 *
 * The database allows a single OWNER and refuses to delete it, so this spec runs only on the
 * CI's disposable Supabase (one fresh instance per browser project) and leaves its OWNER there
 * for the instance's destruction, like the RBAC request-chain stage.
 */
const disposableDatabase = process.env.CI === "true"
  && process.env.ALLOW_TEST_DATABASE_MUTATIONS === "true"
  && process.env.TEST_DATABASE_CONFIRMED_NON_PRODUCTION === "true"
  && /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(process.env.SUPABASE_TEST_URL ?? "");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Server work plus the /admin re-render that the action's revalidation streams back. */
const settle = { timeout: 20_000 };
const ADMIN_SECTIONS = ["系统状态", "运行与用量", "操作入口", "用户与角色", "最近运行"] as const;

const isRoleAction = (request: Request) => request.method() === "POST"
  && new URL(request.url()).pathname === "/admin"
  && Boolean(request.headers()["next-action"]);

interface CapturedAction {
  /** The headers that make a POST a Server Action call: its ID, router state and encoding. */
  headers: Record<string, string>;
  args: unknown[];
}

async function captureAction(request: Request): Promise<CapturedAction> {
  const all = await request.allHeaders();
  const headers: Record<string, string> = {};
  for (const name of ["next-action", "next-router-state-tree", "content-type", "accept"]) {
    if (all[name]) headers[name] = all[name];
  }
  const body = request.postData();
  expect(body, "The role change must be sent as an encoded argument list.").toBeTruthy();
  const args: unknown = JSON.parse(body!);
  expect(Array.isArray(args)).toBe(true);
  return { headers, args: args as unknown[] };
}

/** Calls the /admin Server Action directly, the way a client that knows its ID could. */
function callAction(api: APIRequestContext, origin: string, action: CapturedAction, args: unknown[]) {
  return api.post(`${origin}/admin`, {
    headers: { ...action.headers, origin },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
}

/** The JSON object starting at `start`, respecting strings, or null if it does not close. */
function jsonObjectAt(text: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
    } else if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && (depth -= 1) === 0) return text.slice(start, index + 1);
  }
  return null;
}

/** The action's return value inside the RSC response, wherever its row places it. */
async function actionResultOf(response: APIResponse) {
  const body = await response.text();
  for (let start = body.indexOf("{\"ok\":"); start >= 0; start = body.indexOf("{\"ok\":", start + 1)) {
    const json = jsonObjectAt(body, start);
    if (!json) continue;
    const value = JSON.parse(json) as Record<string, unknown>;
    if (typeof value.ok === "boolean" && ("code" in value || "member" in value)) return value;
  }
  throw new Error(`The Server Action response carried no role-change result (HTTP ${response.status()}).`);
}

/** Where a refused request was sent: middleware Location or the action's redirect header. */
function redirectTargetOf(response: APIResponse) {
  const headers = response.headers();
  const target = headers.location ?? headers["x-action-redirect"] ?? "";
  return target.startsWith("http") ? new URL(target).pathname : target.split(/[;?]/, 1)[0];
}

/*
 * Diagnostics for an intermittent stall seen on every browser project: after a Server Action, a
 * router update that carries fresh /admin data (the action's revalidated tree or a later
 * router.refresh()) is fetched correctly but never committed. The probe only counts React commits
 * through the standard DevTools hook; on failure the spec records React's root lanes, the router
 * state hook's pending lanes, and whether one more refresh commits. It changes no app behavior.
 */
function installReactCommitProbe() {
  const probe = { commits: 0, roots: new Set<unknown>() };
  Object.defineProperty(window, "__aigCommitProbe", { value: probe });
  if ("__REACT_DEVTOOLS_GLOBAL_HOOK__" in window) return;
  let renderers = 0;
  Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
    configurable: true,
    value: {
      supportsFiber: true,
      isDisabled: false,
      renderers: new Map(),
      inject: () => (renderers += 1),
      onCommitFiberRoot: (...args: unknown[]) => { probe.commits += 1; probe.roots.add(args[1]); },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    },
  });
}

async function collectStallDiagnostics(page: Page) {
  return page.evaluate(async () => {
    type Update = { lane: number; revertLane?: number; action: unknown; next: Update };
    type Hook = { memoizedState?: unknown; queue?: { lanes?: number; pending?: Update | null; lastRenderedState?: unknown } | null; baseQueue?: Update | null; next?: Hook | null };
    type QueuedAction = { payload?: { type?: string }; discarded?: boolean; next?: QueuedAction | null } | null;
    type ActionQueue = { pending?: QueuedAction; last?: QueuedAction; needsRefresh?: boolean };
    type Fiber = { memoizedState?: unknown; memoizedProps?: unknown; lanes?: number; child?: Fiber | null; sibling?: Fiber | null };
    type Root = { current: Fiber; pendingLanes: number; suspendedLanes: number; pingedLanes: number; entangledLanes: number; expiredLanes: number; callbackNode: unknown; callbackPriority: number };
    const probe = (window as unknown as { __aigCommitProbe?: { commits: number; roots: Set<Root> } }).__aigCommitProbe;
    const router = (window as unknown as { next?: { router?: { refresh?: () => void } } }).next?.router;
    const bits = (lanes: number) => (lanes >>> 0).toString(2);
    const isThenable = (value: unknown) => typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
    const isRouterState = (value: unknown) => typeof value === "object" && value !== null && "canonicalUrl" in value && "tree" in value;
    const describeValue = (value: unknown) => isThenable(value)
      ? `thenable:${String((value as { status?: unknown }).status ?? "untracked")}`
      : isRouterState(value) ? "router-state" : typeof value;
    // The router cache along the state's tree: which segment's RSC is missing or still pending.
    type CacheNode = { rsc?: unknown; prefetchRsc?: unknown; lazyData?: unknown; loading?: unknown; parallelRoutes?: Map<string, Map<string, CacheNode>> };
    type RouterTree = [unknown, Record<string, RouterTree>?, ...unknown[]];
    const describeRsc = (value: unknown) => value === null ? "null" : value === undefined ? "undefined"
      : isThenable(value) ? `thenable:${String((value as { status?: unknown }).status ?? "untracked")}` : typeof value === "object" ? "value" : typeof value;
    const cacheTree = (state: unknown) => {
      if (!isRouterState(state)) return null;
      const router = state as { tree: RouterTree; cache: CacheNode; canonicalUrl: string; pushRef?: { mpaNavigation?: boolean } };
      const nodes: Array<Record<string, string | null>> = [];
      const visit = (tree: RouterTree | undefined, node: CacheNode | undefined, path: string, depth: number) => {
        if (!tree || depth > 12) return;
        nodes.push({ path: path || "/", node: node ? "present" : "missing", rsc: describeRsc(node?.rsc), prefetchRsc: describeRsc(node?.prefetchRsc), lazyData: node?.lazyData ? describeRsc(node.lazyData) : null, loading: describeRsc(node?.loading) });
        for (const [key, childTree] of Object.entries(tree[1] ?? {})) {
          const segment = childTree[0];
          const name = typeof segment === "string" ? segment : JSON.stringify(segment);
          const children = node?.parallelRoutes?.get(key);
          let child = children?.get(typeof segment === "string" ? segment : "");
          if (!child && children) for (const [cacheKey, candidate] of children) if (String(cacheKey).startsWith(name.split("?")[0])) { child = candidate; break; }
          visit(childTree, child, `${path}/${key}:${name}`, depth + 1);
        }
      };
      visit(router.tree, router.cache, "", 0);
      return { canonicalUrl: router.canonicalUrl, mpaNavigation: Boolean(router.pushRef?.mpaNavigation), nodes };
    };
    // Circular update list: `last.next` is the first update.
    const updates = (last: Update | null | undefined) => {
      const list: Array<{ lane: string; action: string; cache?: ReturnType<typeof cacheTree> }> = [];
      for (let update = last?.next, index = 0; update && index < 32; update = update.next, index += 1) {
        const fulfilled = isThenable(update.action) && (update.action as { status?: unknown }).status === "fulfilled";
        list.push({ lane: bits(update.lane), action: describeValue(update.action), ...(fulfilled ? { cache: cacheTree((update.action as { value?: unknown }).value) } : {}) });
        if (update === last) break;
      }
      return list;
    };
    // Next.js's AppRouter receives the router action queue as a prop; its first state hook holds the router state.
    const routerHook = (root: Root) => {
      const stack: Fiber[] = [root.current];
      for (let visited = 0; stack.length && visited < 50_000; visited += 1) {
        const fiber = stack.pop()!;
        const props = fiber.memoizedProps as { actionQueue?: ActionQueue } | null | undefined;
        let hook = fiber.memoizedState as Hook | null | undefined;
        for (let index = 0; hook && typeof hook === "object" && index < 64 && !(isRouterState(hook.queue?.lastRenderedState) || isThenable(hook.queue?.lastRenderedState)); index += 1) hook = hook.next;
        // The outer AppRouter only forwards the queue; the component that calls useActionQueue owns the state hook.
        if (props && typeof props === "object" && props.actionQueue && typeof props.actionQueue === "object" && hook && typeof hook === "object" && hook.queue) {
          const queue = props.actionQueue;
          const queued: string[] = [];
          for (let action = queue.pending, index = 0; action && index < 16; action = action.next ?? null, index += 1) {
            queued.push(`${action.payload?.type ?? "?"}${action.discarded ? "(discarded)" : ""}`);
          }
          return {
            actionQueue: { queued, needsRefresh: Boolean(queue.needsRefresh), last: queue.last?.payload?.type ?? null },
            fiberLanes: bits(fiber.lanes ?? 0),
            stateHook: hook ? {
              committed: describeValue(hook.memoizedState),
              committedCache: cacheTree(isThenable(hook.memoizedState) ? (hook.memoizedState as { value?: unknown }).value : hook.memoizedState),
              lastRendered: describeValue(hook.queue?.lastRenderedState),
              queueLanes: bits(hook.queue?.lanes ?? 0),
              baseQueue: updates(hook.baseQueue),
              pending: updates(hook.queue?.pending),
            } : null,
          };
        }
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
      }
      return null;
    };
    const snapshot = () => ({
      commits: probe?.commits ?? null,
      admins: document.querySelector('[aria-label="系统概览"]')?.textContent?.match(/\d+ 名管理员/)?.[0] ?? null,
      roots: [...(probe?.roots ?? [])].map((root) => ({
        pending: bits(root.pendingLanes), suspended: bits(root.suspendedLanes), pinged: bits(root.pingedLanes),
        entangled: bits(root.entangledLanes), expired: bits(root.expiredLanes),
        scheduled: root.callbackNode !== null, callbackPriority: root.callbackPriority, routerHook: routerHook(root),
      })),
    });
    const before = snapshot();
    router?.refresh?.();
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    return { visibility: document.visibilityState, focused: document.hasFocus(), probeInstalled: Boolean(probe), refreshAvailable: Boolean(router?.refresh), before, afterOneMoreRefresh: snapshot() };
  });
}

const row = (page: Page, person: IsolatedE2eUser) => page.locator(`li[data-member-id="${person.userId}"]`);
const notice = (page: Page, person: IsolatedE2eUser) => page.locator(`[id="member-notice-${person.userId}"]`);
const roleBadge = (page: Page, person: IsolatedE2eUser) => row(page, person).locator("[data-platform-role]");
const changeTrigger = (page: Page, person: IsolatedE2eUser) => row(page, person).getByRole("button", { name: /^更改角色/ });

/** Opens a member's role dialog after settling its trigger in view (smooth scrolling off, as the memory spec does for WebKit). */
async function openRoleDialog(page: Page, person: IsolatedE2eUser) {
  const trigger = changeTrigger(page, person);
  await trigger.evaluate(async (element) => {
    const root = document.documentElement;
    const previous = [root.style.getPropertyValue("scroll-behavior"), root.style.getPropertyPriority("scroll-behavior")] as const;
    root.style.setProperty("scroll-behavior", "auto", "important");
    element.scrollIntoView({ block: "center", inline: "nearest" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (previous[0]) root.style.setProperty("scroll-behavior", previous[0], previous[1]);
    else root.style.removeProperty("scroll-behavior");
  });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "调整平台角色" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("platform role administration", () => {
  test.describe.configure({ retries: 0 });
  test.skip(!disposableDatabase, "Runs only against the CI's disposable Supabase: it leaves a protected OWNER behind.");

  test("the OWNER grants and revokes ADMIN through /admin and the server refuses everyone else", async ({ browser, page, playwright }, testInfo) => {
    test.setTimeout(300_000);
    const baseURL = testInfo.project.use.baseURL ?? "http://127.0.0.1:3000";
    const origin = new URL(baseURL).origin;
    const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
    const db = new PrismaClient();
    const adminContext = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
    const adminPage = await adminContext.newPage();
    const signedOut = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const cleanup: IsolatedE2eUser[] = [];
    let owner: IsolatedE2eUser | undefined;
    let ownerBound = false;

    // Uncaught exceptions and React render or hydration errors on either signed-in page.
    const pageErrors: string[] = [];
    for (const target of [page, adminPage]) {
      target.on("pageerror", (error) => pageErrors.push(`page: ${error.message}`));
      target.on("console", (message) => {
        if (message.type() === "error" && /hydrat|Minified React error|Uncaught/i.test(message.text())) pageErrors.push(`console: ${message.text()}`);
      });
    }

    let failure: unknown;
    try {
      await page.addInitScript(installReactCommitProbe);
      expect(await db.profile.count({ where: { role: "OWNER" } }), "The disposable database must start without an OWNER.").toBe(0);
      owner = await createIsolatedE2eUser(page, testInfo, "rbac-owner");
      // The disposable stand-in for the reviewed OWNER bootstrap runbook.
      await db.profile.update({ where: { id: owner.userId }, data: { role: "OWNER" } });
      ownerBound = true;
      const admin = await createIsolatedE2eUser(adminPage, testInfo, "rbac-admin");
      cleanup.push(admin);
      await db.profile.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
      const memberA = await createIsolatedE2eAccount(testInfo, "rbac-member-a");
      cleanup.push(memberA);
      const memberB = await createIsolatedE2eAccount(testInfo, "rbac-member-b");
      cleanup.push(memberB);

      const roleOf = (person: IsolatedE2eUser) => db.profile.findUniqueOrThrow({ where: { id: person.userId }, select: { role: true, roleVersion: true } });
      const auditsOf = (person: IsolatedE2eUser) => db.platformRoleAudit.findMany({ where: { targetId: person.userId }, orderBy: { createdAt: "asc" } });

      // Another member's private conversation, which no platform role may read.
      const secret = `rbac-private-${randomUUID()}`;
      const privateConversation = await db.conversation.create({
        data: { userId: memberA.userId, title: `${secret} title`, messages: { create: [{ role: "USER", content: `${secret} message`, status: "COMPLETE" }] } },
        select: { id: true },
      });

      const dialog = page.getByRole("dialog", { name: "调整平台角色" });
      let grantAction: CapturedAction;

      await test.step("OWNER sees the full admin console with change controls only where the server allows them", async () => {
        await page.goto("/admin");
        await expect(page.getByRole("list", { name: "平台用户" })).toBeVisible(settle);
        for (const title of ADMIN_SECTIONS) await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(page.getByText("可以调整平台角色，每位用户可做的调整以该行显示为准", { exact: true })).toBeVisible();
        await expect(page.getByText("角色调整暂不可用")).toHaveCount(0);
        // No audit read endpoint exists: the page says so and shows no records.
        await expect(page.locator('[data-audit-state="unavailable"]')).toBeVisible();
        await expect(row(page, owner!).locator('[data-restriction="SELF"]')).toBeVisible();
        await expect(changeTrigger(page, owner!)).toHaveCount(0);
        for (const person of [admin, memberA, memberB]) await expect(changeTrigger(page, person)).toBeVisible();
        expect(await page.content()).not.toContain(secret);
      });

      await test.step("OWNER grants ADMIN; the request carries the database version and the row follows the server", async () => {
        await expect(roleBadge(page, memberA)).toHaveAttribute("data-platform-role", "USER");
        await openRoleDialog(page, memberA);
        await expect(dialog.getByRole("radio", { name: /^平台管理员/ })).toBeChecked();
        const [request, response] = await Promise.all([
          page.waitForRequest(isRoleAction),
          page.waitForResponse((candidate) => isRoleAction(candidate.request())),
          dialog.getByRole("button", { name: "确认授予管理员" }).click(),
        ]);
        expect(response.status()).toBe(200);
        grantAction = await captureAction(request);
        expect(grantAction.args).toEqual([{ profileId: memberA.userId, expectedRole: "USER", expectedVersion: "0", nextRole: "ADMIN", requestId: expect.stringMatching(UUID) }]);

        await expect(dialog).toBeHidden(settle);
        // Synced: the revalidated server snapshot shows the member at the new version.
        await expect(notice(page, memberA)).toHaveText("已授予平台管理员。", settle);
        await expect(roleBadge(page, memberA)).toHaveAttribute("data-platform-role", "ADMIN");
        await expect(changeTrigger(page, memberA)).not.toHaveAttribute("aria-disabled", "true");
        expect(await roleOf(memberA)).toEqual({ role: "ADMIN", roleVersion: 1 });
        const [{ requestId }] = grantAction.args as Array<{ requestId: string }>;
        expect(await auditsOf(memberA)).toEqual([expect.objectContaining({ actorId: owner!.userId, oldRole: "USER", newRole: "ADMIN", requestId })]);
      });

      await test.step("ADMIN sees the console read-only and every crafted ADMIN request is refused", async () => {
        await adminPage.goto("/admin");
        await expect(adminPage.getByRole("list", { name: "平台用户" })).toBeVisible(settle);
        for (const title of ADMIN_SECTIONS) await expect(adminPage.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(adminPage.getByRole("button", { name: /^更改角色/ })).toHaveCount(0);
        await expect(adminPage.getByText("不能调整平台角色", { exact: true })).toBeVisible();
        await expect(row(adminPage, owner!).locator('[data-restriction="OWNER_PROTECTED"]')).toBeVisible();
        await expect(row(adminPage, memberA).locator('[data-restriction="PEER_ADMIN"]')).toBeVisible();
        await expect(row(adminPage, admin).locator('[data-restriction="SELF"]')).toBeVisible();
        expect(await adminPage.content()).not.toContain(secret);

        const forged = [
          { profileId: memberB.userId, expectedRole: "USER", expectedVersion: "0", nextRole: "ADMIN", requestId: randomUUID() },
          { profileId: memberA.userId, expectedRole: "ADMIN", expectedVersion: "1", nextRole: "USER", requestId: randomUUID() },
          { profileId: owner!.userId, expectedRole: "ADMIN", expectedVersion: "1", nextRole: "USER", requestId: randomUUID() },
        ];
        for (const request of forged) {
          const response = await callAction(adminContext.request, origin, grantAction, [request]);
          expect(response.status()).toBe(200);
          expect(await actionResultOf(response)).toEqual({ ok: false, code: "FORBIDDEN" });
        }
        expect(await roleOf(memberB)).toEqual({ role: "USER", roleVersion: 0 });
        expect(await roleOf(memberA)).toEqual({ role: "ADMIN", roleVersion: 1 });
        expect(await roleOf(owner!)).toMatchObject({ role: "OWNER" });
        expect(await db.platformRoleRequest.count({ where: { requestId: { in: forged.map((request) => request.requestId) } } })).toBe(0);
        expect(await auditsOf(memberB)).toEqual([]);
      });

      await test.step("a change based on a stale version is refused and the dialog re-bases on fresh data", async () => {
        await openRoleDialog(page, memberB);
        await expect(dialog.getByRole("radio", { name: /^平台管理员/ })).toBeChecked();
        // Someone else changes the member after this screen loaded (version 0 -> 1).
        await db.profile.update({ where: { id: memberB.userId }, data: { role: "ADMIN" } });
        const [response] = await Promise.all([
          page.waitForResponse((candidate) => isRoleAction(candidate.request())),
          dialog.getByRole("button", { name: "确认授予管理员" }).click(),
        ]);
        expect(response.status()).toBe(200);
        await expect(dialog.getByText("角色已被他人修改", { exact: true })).toBeVisible(settle);
        await expect(dialog.getByText(/这位用户现在是平台管理员。/)).toBeVisible();
        await expect(dialog.getByRole("button", { name: "确认授予管理员" })).toBeDisabled();
        expect(await roleOf(memberB)).toEqual({ role: "ADMIN", roleVersion: 1 });
        expect(await auditsOf(memberB)).toEqual([]);

        await dialog.getByRole("button", { name: "刷新最新状态" }).click();
        await expect(dialog.getByText("角色已从普通用户变为平台管理员，之前的选择已清除。请按最新状态重新确认。", { exact: true })).toBeVisible(settle);
        await expect(dialog.getByRole("radio", { name: /^普通用户/ })).toBeChecked();
        await expect(notice(page, memberB)).toHaveText("上次调整未执行（角色已被他人修改），已显示最新状态。");
      });

      let dropped: CapturedAction | undefined;
      await test.step("a change whose response is lost after commit stays unconfirmed until a refresh shows the real role", async () => {
        let droppedStatus: number | undefined;
        await page.route((url) => url.pathname === "/admin", async (route) => {
          const request = route.request();
          if (dropped || !isRoleAction(request)) return route.fallback();
          // The server runs and commits the change; the browser never receives the answer.
          const committed = await route.fetch();
          droppedStatus = committed.status();
          dropped = await captureAction(request);
          await route.abort("failed");
        });
        await dialog.getByRole("button", { name: "确认撤销管理员" }).click();
        await expect(dialog.getByText("请求中断，无法确认调整是否生效。请刷新查看实际角色，不要重复提交。", { exact: true })).toBeVisible(settle);
        await expect(dialog.getByRole("button", { name: "确认撤销管理员" })).toBeDisabled();
        await page.unrouteAll({ behavior: "wait" });
        expect(droppedStatus).toBe(200);
        expect(dropped!.args).toEqual([expect.objectContaining({ profileId: memberB.userId, expectedRole: "ADMIN", expectedVersion: "1", nextRole: "USER" })]);
        // It did commit, and the screen did not claim either way.
        expect(await roleOf(memberB)).toEqual({ role: "USER", roleVersion: 2 });
        expect(await auditsOf(memberB)).toHaveLength(1);
        await expect(notice(page, memberB)).not.toContainText("已撤销");

        await dialog.getByRole("button", { name: "刷新最新状态" }).click();
        await expect(dialog.getByText("角色已从平台管理员变为普通用户，之前的选择已清除。请按最新状态重新确认。", { exact: true })).toBeVisible(settle);
        await dialog.getByRole("button", { name: "取消", exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(roleBadge(page, memberB)).toHaveAttribute("data-platform-role", "USER");
        await expect(notice(page, memberB)).toHaveText("上次调整的结果未能确认，已显示最新状态。");
      });

      await test.step("replaying the lost request confirms it without applying it twice; reusing its ID for another intent conflicts", async () => {
        const replay = await callAction(page.request, origin, dropped!, dropped!.args);
        expect(replay.status()).toBe(200);
        expect(await actionResultOf(replay)).toEqual({ ok: true, changed: false, member: { id: memberB.userId, platformRole: "USER", roleVersion: "2" } });
        const [original] = dropped!.args as Array<Record<string, string>>;
        const reused = await callAction(page.request, origin, dropped!, [{ ...original, expectedRole: "USER", expectedVersion: "2", nextRole: "ADMIN" }]);
        expect(await actionResultOf(reused)).toEqual({ ok: false, code: "ROLE_CONFLICT", currentRole: "USER", currentVersion: "2" });
        expect(await roleOf(memberB)).toEqual({ role: "USER", roleVersion: 2 });
        expect(await auditsOf(memberB)).toHaveLength(1);
      });

      await test.step("OWNER revokes an ADMIN, whose next admin request is refused", async () => {
        await openRoleDialog(page, admin);
        await expect(dialog.getByRole("radio", { name: /^普通用户/ })).toBeChecked();
        const [response] = await Promise.all([
          page.waitForResponse((candidate) => isRoleAction(candidate.request())),
          dialog.getByRole("button", { name: "确认撤销管理员" }).click(),
        ]);
        expect(response.status()).toBe(200);
        await expect(notice(page, admin)).toHaveText("已撤销平台管理员。", settle);
        await expect(roleBadge(page, admin)).toHaveAttribute("data-platform-role", "USER");
        expect(await roleOf(admin)).toEqual({ role: "USER", roleVersion: 2 });

        await adminPage.goto("/admin");
        await expect(adminPage).toHaveURL(/\/workspace(?:[/?#]|$)/, settle);
        const demoted = await callAction(adminContext.request, origin, grantAction, [{ profileId: memberB.userId, expectedRole: "USER", expectedVersion: "2", nextRole: "ADMIN", requestId: randomUUID() }]);
        expect(demoted.status()).toBe(303);
        expect(redirectTargetOf(demoted)).toBe("/workspace");
        const anonymous = await callAction(signedOut, origin, grantAction, [{ profileId: memberB.userId, expectedRole: "USER", expectedVersion: "2", nextRole: "ADMIN", requestId: randomUUID() }]);
        expect([303, 307]).toContain(anonymous.status());
        expect(redirectTargetOf(anonymous)).toBe("/login");
        expect(await roleOf(memberB)).toEqual({ role: "USER", roleVersion: 2 });
      });

      await test.step("every applied change was audited once, by the OWNER", async () => {
        const audits = await db.platformRoleAudit.findMany({ where: { targetId: { in: [admin.userId, memberA.userId, memberB.userId] } } });
        expect(audits).toHaveLength(3);
        for (const audit of audits) expect(audit.actorId).toBe(owner!.userId);
      });

      await test.step("the OWNER role grants no access to another member's private conversation", async () => {
        await page.goto(`/chat/${privateConversation.id}`);
        await expect(page.getByText("这个页面不在这里", { exact: true })).toBeVisible(settle);
        expect(await page.content()).not.toContain(secret);
      });

      expect(pageErrors, "The admin pages must not throw or fail to render.").toEqual([]);
    } catch (error) {
      failure = error;
      try {
        const diagnostics = await collectStallDiagnostics(page);
        console.log(`[rbac-e2e] stall diagnostics ${JSON.stringify(diagnostics)}`);
        await testInfo.attach("stall-diagnostics", { body: JSON.stringify(diagnostics, null, 2), contentType: "application/json" });
      } catch (diagnosticError) {
        console.log(`[rbac-e2e] stall diagnostics unavailable: ${String(diagnosticError)}`);
      }
      throw error;
    } finally {
      const cleanupErrors: unknown[] = [];
      for (const close of [() => signedOut.dispose(), () => adminContext.close()]) {
        try { await close(); } catch (error) { cleanupErrors.push(error); }
      }
      // A bound OWNER is protected by the database and stays for the instance's destruction.
      if (owner && !ownerBound) cleanup.push(owner);
      for (const identity of cleanup.reverse()) {
        try { await cleanupIsolatedE2eUser(identity, db); } catch (error) { cleanupErrors.push(error); }
      }
      await db.$disconnect();
      if (cleanupErrors.length) {
        await testInfo.attach("cleanup-errors", { body: cleanupErrors.map(String).join("\n"), contentType: "text/plain" });
        if (!failure) throw new AggregateError(cleanupErrors, "Platform role E2E cleanup failed.");
      }
    }
  });
});
