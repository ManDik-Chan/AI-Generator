/*
 * Server-renders the Registry read-only screens from real store snapshots (fake fetch). Local
 * browser automation is paused (AGENTS.md); this checks content, states and controls, not layout.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConsoleHeader } from "@/features/developer-console/components/console-header";
import { ConsoleProvider } from "@/features/developer-console/components/console-provider";
import { RegistryConsoleHeader } from "@/features/developer-console/components/registry-header";
import { RegistryProjectView } from "@/features/developer-console/components/registry-project";
import { RegistryWorkbenchView } from "@/features/developer-console/components/registry-workbench";
import { createRegistryReadClient } from "@/features/developer-console/registry/client";
import { createOverviewStore, createProjectStore } from "@/features/developer-console/registry/store";
import { createSeedState } from "@/features/developer-console/mock/seed";
import {
  DRAFT, FIXED_NOW, PROJECT, TOKEN, defaultRoutes, draftEtag, draftHead, draftRead, err, fakeFetch, ok, page, payloadFor,
  type FakeResponse,
} from "@/tests/fixtures/registry-console-read";

const base = "/developer/registry";
const p = `projects/${PROJECT}`;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const mockNames = createSeedState().projects.map((project) => project.name);

async function overview(routes: Record<string, FakeResponse> = defaultRoutes(), token: string | null = TOKEN) {
  const client = createRegistryReadClient({ fetch: fakeFetch(routes).fetch, getAccessToken: async () => token, now: () => FIXED_NOW });
  const store = createOverviewStore(client, { now: () => FIXED_NOW });
  await store.refresh();
  return renderToStaticMarkup(createElement(RegistryWorkbenchView, { snapshot: store.getSnapshot(), base, mockHref: "/developer", now: FIXED_NOW, onRefresh() {}, onLoadMore() {} }));
}
async function project(changes: Record<string, FakeResponse> = {}) {
  const client = createRegistryReadClient({ fetch: fakeFetch({ ...defaultRoutes(), ...changes }).fetch, getAccessToken: async () => TOKEN, now: () => FIXED_NOW });
  const store = createProjectStore(client, PROJECT, { now: () => FIXED_NOW });
  await store.refresh();
  return renderToStaticMarkup(createElement(RegistryProjectView, { snapshot: store.getSnapshot(), base, mockHref: "/developer", now: FIXED_NOW, onRefresh() {}, onLoadMore() {} }));
}
function expectRealAndClean(html: string) {
  expect(text(html)).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
  expect(html).toContain("Registry 只读");
  expect(html).not.toContain("Mock 数据源");
  for (const name of mockNames) expect(html).not.toContain(name);
}

describe("Registry read-only screens", () => {
  it("overview lists own qualifications by action and projects linked by ID", async () => {
    const html = await overview();
    expectRealAndClean(html);
    expect(html).toContain(`${base}/projects/${PROJECT}`);
    expect(html).toContain("/console-read-fixture");
    const plain = text(html);
    expect(plain.indexOf("READ_DRAFT")).toBeLessThan(plain.indexOf("READ_RELEASE"));
    expect(plain).toContain("剩 26 小时");
    expect(plain).toContain("剩 5 分钟");
    expect(plain).toContain("不代表某个对象的命令可以执行");
  });

  it("overview shows the switched-off API as a real state and offers the mock only as a separate link", async () => {
    const html = await overview({ qualifications: err("DISABLED", 403), projects: err("DISABLED", 403) });
    expectRealAndClean(html);
    expect(html).toContain("Registry 只读接口未开启");
    expect(html).toContain('href="/developer"');
    expect(html).not.toContain("/console-read-fixture");
    expect(html).not.toContain("我的项目");
  });

  it("overview without a session asks to sign in again and returns to the Registry mode", async () => {
    const html = await overview(defaultRoutes(), null);
    expect(html).toContain("没有可用的登录会话");
    expect(html).toContain(`href="/login?next=${encodeURIComponent(base)}"`);
  });

  it("project view orders lists by time, binds hashes and offers no write control", async () => {
    const html = await project();
    expectRealAndClean(html);
    const plain = text(html);
    expect(plain.indexOf("v1.1.0")).toBeLessThan(plain.indexOf("v1.0.0"));
    expect(plain.indexOf("发布于 10-30")).toBeLessThan(plain.indexOf("发布于 10-21"));
    expect(plain.indexOf("rev 3")).toBeLessThan(plain.indexOf("rev 1 ·"));
    expect(plain).toContain("绑定当前草稿内容");
    expect(plain).toContain("与当前草稿内容不同");
    expect(plain).toContain("由你提交");
    expect(plain).toContain("由你申请");
    expect(plain).toContain("已过期");
    expect(plain).toContain("绑定已过时");
    expect(plain).toContain("早期记录（无申请意图）");
    expect(plain).toContain("当前发布的版本");
    expect(html).toContain(draftRead.contentHash);
    expect(html).toContain(`&quot;draft:${DRAFT}:3&quot;`);
    expect((plain.match(/不可执行/g) ?? []).length).toBe(12);
    expect(plain).toContain("编辑草稿 有资格 · 不可执行");
    expect(plain).toContain("发布 无资格 · 不可执行");
    // The only control is the refresh button: no form, no command button.
    expect(html.match(/<button/g) ?? []).toHaveLength(1);
    expect(html).toContain("重新读取");
    expect(html).not.toMatch(/<form|<textarea|<input/);
  });

  it("project view keeps Draft reads when READ_RELEASE is missing, and says which qualification is missing", async () => {
    const html = await project({ [`${p}/release/head`]: err("FORBIDDEN", 403), [`${p}/releases`]: err("FORBIDDEN", 403), [`${p}/release-requests`]: err("FORBIDDEN", 403) });
    expect(html).toContain("没有 READ_RELEASE 读取资格");
    expect(html).not.toContain("没有 READ_DRAFT 读取资格");
    expect(html).toContain("Console read fixture");
    expect(html).not.toContain("发布于");
  });

  it("project view shows an uninitialized draft as a state", async () => {
    const html = await project({
      [`${p}/draft/head`]: ok({ ...draftHead, state: "DRAFT", revision: 1, contentHash: null }, draftEtag(1)),
      [`${p}/draft`]: err("DRAFT_UNINITIALIZED", 409),
      [`${p}/drafts/${DRAFT}/reviews`]: ok(page([])),
    });
    expect(html).toContain("409 DRAFT_UNINITIALIZED");
    expect(html).toContain("无：草稿内容尚未初始化或无效");
    expect(html).toContain("当前草稿还没有提交过审核");
  });

  it("project view reports a missing or foreign project once", async () => {
    const notFound = Object.fromEntries(Object.keys(defaultRoutes()).filter((key) => key.startsWith(p)).map((key) => [key, err("NOT_FOUND", 404)]));
    const html = await project(notFound);
    expect(html).toContain("不存在，或你不是有效成员");
    expect((html.match(/不存在，或你不是有效成员/g) ?? []).length).toBe(1);
    expect(html).not.toContain("写入命令");
  });

  it("project view warns when the head and the draft were read from different states", async () => {
    const html = await project({ [`${p}/draft`]: ok({ ...draftRead, revision: 4 }, draftEtag(4)) });
    expect(html).toContain("两次独立读取");
  });

  it("renders stored text as text", async () => {
    const payload = payloadFor(PROJECT, "1.2.0");
    payload.manifest.summary = '<img src=x onerror="alert(1)">';
    const html = await project({ [`${p}/draft`]: ok({ ...draftRead, payload }, draftEtag()) });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("console headers state the data source", () => {
  it("Registry header marks the Registry mode current and links back to the mock", () => {
    const html = renderToStaticMarkup(createElement(RegistryConsoleHeader, { base, mockHref: "/developer" }));
    expect(html).toContain("Registry 数据源");
    expect(html).toContain("当前登录账户");
    expect(html).toMatch(/aria-current="page"[^>]*href="\/developer\/registry"|href="\/developer\/registry"[^>]*aria-current="page"/);
    expect(html).not.toContain("模拟身份");
  });

  it("signed-in mock header offers the switch; the public demo header does not", () => {
    const signedIn = renderToStaticMarkup(createElement(ConsoleProvider, null, createElement(ConsoleHeader, { base: "/developer", registryHref: base })));
    expect(signedIn).toContain("Mock 数据源");
    expect(signedIn).toContain(`href="${base}"`);
    expect(signedIn).toContain("模拟身份");
    const publicDemo = renderToStaticMarkup(createElement(ConsoleProvider, null, createElement(ConsoleHeader, { base: "/platform/developer" })));
    expect(publicDemo).not.toContain("Registry 只读");
  });

  it("mock screens cannot render outside their provider, so the Registry routes cannot show mock data", () => {
    expect(() => renderToStaticMarkup(createElement(ConsoleHeader, { base: "/developer" }))).toThrow(/ConsoleProvider/);
  });
});
