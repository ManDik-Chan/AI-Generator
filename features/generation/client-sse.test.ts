import { describe, expect, it } from "vitest";

import { readSseEvents } from "@/features/generation/client-sse";

describe("shared client SSE reader", () => {
  it("parses application events across transport chunks", async () => {
    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: run\ndata: {"runId":"one"}\n'));
        controller.enqueue(encoder.encode('\nevent: done\ndata: {"status":"COMPLETE"}\n\n'));
        controller.close();
      },
    }));
    const events: Array<{ event: string; data: Record<string, string> }> = [];
    await readSseEvents<{ event: string; data: Record<string, string> }>(response, (event) => events.push(event));
    expect(events).toEqual([
      { event: "run", data: { runId: "one" } },
      { event: "done", data: { status: "COMPLETE" } },
    ]);
  });

  it("surfaces a safe JSON error when no stream was created", async () => {
    const response = Response.json({ message: "今日 Agent Credits 已用完。" }, { status: 429 });
    await expect(readSseEvents(response, () => undefined)).rejects.toThrow("今日 Agent Credits 已用完。");
  });
});
