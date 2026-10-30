import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page, Request, TestInfo } from "@playwright/test";

import {
  createE2eNamespace,
  e2eBusinessToken,
  isAcceptedLoginTransportEnd,
  waitForRequestSettled,
} from "./isolated-user";

function fakeRequest(pathname: string, method: string, failure?: string) {
  return {
    url: () => `http://127.0.0.1:3000${pathname}`,
    method: () => method,
    failure: () => (failure ? { errorText: failure } : null),
  } as unknown as Request;
}

const isLoginPost = (request: Request) =>
  new URL(request.url()).pathname === "/login" && request.method() === "POST";

function fakePage() {
  const events = new EventEmitter();
  return { events, page: events as unknown as Pick<Page, "on" | "off"> };
}

describe("login transport settlement", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves null when the matching request finishes", async () => {
    const { events, page } = fakePage();
    const settled = waitForRequestSettled(page, isLoginPost, 1_000);
    events.emit("requestfinished", fakeRequest("/login", "POST"));
    await expect(settled).resolves.toBeNull();
  });

  it("resolves the failure text when the response is aborted instead of finishing", async () => {
    const { events, page } = fakePage();
    const settled = waitForRequestSettled(page, isLoginPost, 1_000);
    events.emit("requestfailed", fakeRequest("/login", "POST", "net::ERR_ABORTED"));
    await expect(settled).resolves.toBe("net::ERR_ABORTED");
  });

  it("ignores other requests and removes its listeners once settled", async () => {
    const { events, page } = fakePage();
    const settled = waitForRequestSettled(page, isLoginPost, 1_000);
    events.emit("requestfinished", fakeRequest("/login", "GET"));
    events.emit("requestfailed", fakeRequest("/register", "POST", "net::ERR_FAILED"));
    events.emit("requestfinished", fakeRequest("/login", "POST"));
    await expect(settled).resolves.toBeNull();
    expect(events.listenerCount("requestfinished")).toBe(0);
    expect(events.listenerCount("requestfailed")).toBe(0);
  });

  it("reports a bounded timeout instead of hanging", async () => {
    vi.useFakeTimers();
    const { events, page } = fakePage();
    const settled = waitForRequestSettled(page, isLoginPost, 30_000);
    vi.advanceTimersByTime(30_000);
    await expect(settled).resolves.toBe("not settled within 30000ms");
    expect(events.listenerCount("requestfinished")).toBe(0);
  });

  it("accepts only a finished transport or Chromium's post-response abort", () => {
    expect(isAcceptedLoginTransportEnd(null)).toBe(true);
    expect(isAcceptedLoginTransportEnd("net::ERR_ABORTED")).toBe(true);
    expect(isAcceptedLoginTransportEnd("net::ERR_CONNECTION_RESET")).toBe(false);
    expect(isAcceptedLoginTransportEnd("net::ERR_INCOMPLETE_CHUNKED_ENCODING")).toBe(false);
    expect(isAcceptedLoginTransportEnd("Load request cancelled")).toBe(false);
    expect(isAcceptedLoginTransportEnd("not settled within 30000ms")).toBe(false);
  });
});

function testInfo(project: string, workerIndex: number, retry: number) {
  return {
    project: { name: project },
    workerIndex,
    retry,
  } as TestInfo;
}

describe("authenticated E2E namespace isolation", () => {
  it("includes project, worker and retry while remaining unique", () => {
    const info = testInfo("webkit-iphone", 2, 3);
    const first = createE2eNamespace(info, "proposal");
    const second = createE2eNamespace(info, "proposal");

    expect(first).toMatch(/^proposal-webkit-iphone-w2-r3-[a-f0-9]{12}$/);
    expect(second).toMatch(/^proposal-webkit-iphone-w2-r3-[a-f0-9]{12}$/);
    expect(second).not.toBe(first);
  });

  it("derives a compact business token without dropping isolation dimensions", () => {
    const namespace = createE2eNamespace(
      testInfo("chromium-desktop", 4, 2),
      "proposal-lifecycle",
    );
    const token = e2eBusinessToken(namespace, "proposal-lifecycle");

    expect(token).toMatch(/^chromium_desktop_w4_r2_[a-f0-9]{12}$/);
    expect(token.length).toBeLessThanOrEqual(40);
  });
});
