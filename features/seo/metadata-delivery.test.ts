import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { PREVIEW_USER_AGENTS } from "../../tests/seo/public-meta-contract";

describe("metadata delivery", () => {
  it("renders metadata in <head> for every client, not only Next's built-in bot list", () => {
    const blocking = nextConfig.htmlLimitedBots;
    expect(blocking).toBeInstanceOf(RegExp);
    const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    for (const userAgent of [...Object.values(PREVIEW_USER_AGENTS), browser]) expect(blocking!.test(userAgent), userAgent).toBe(true);
  });
});
