import { describe, expect, it, vi } from "vitest";
import { readSseEvents } from "@/lib/ai/read-sse";

describe("generation SSE client", () => {
  it("reads progress and done events in order", async () => { const events: string[] = []; const response = new Response("event: progress\ndata: {\"stage\":\"preparing\"}\n\nevent: done\ndata: {\"draft\":{}}\n\n"); await readSseEvents(response, (name) => events.push(name)); expect(events).toEqual(["progress", "done"]); });
  it("surfaces a safe JSON error before streaming starts", async () => { const callback = vi.fn(); await expect(readSseEvents(new Response(JSON.stringify({ message: "未配置" }), { status: 503, headers: { "content-type": "application/json" } }), callback)).rejects.toThrow("未配置"); expect(callback).not.toHaveBeenCalled(); });
});
