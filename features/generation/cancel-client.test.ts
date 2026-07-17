import { afterEach, describe, expect, it, vi } from "vitest";

import { requestDurableCancellation } from "@/features/generation/cancel-client";

describe("confirmed durable cancellation client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["CANCELLED", "COMPLETE", "ERROR"] as const)("returns the real %s terminal state", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(requestDurableCancellation("/cancel")).resolves.toBe(status);
  });

  it("does not claim cancellation when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "暂时不可用" }), { status: 503, headers: { "Content-Type": "application/json" } })));
    await expect(requestDurableCancellation("/cancel")).rejects.toThrow("暂时不可用");
  });

  it("rejects an invalid or untrusted status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "cancelled" }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(requestDurableCancellation("/cancel")).rejects.toThrow("无效状态");
  });
});
