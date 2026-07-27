import { describe, expect, it } from "vitest";
import type { TestInfo } from "@playwright/test";

import { createE2eNamespace, e2eBusinessToken } from "./isolated-user";

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
