import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), configured: vi.fn(), getProvider: vi.fn(), createRun: vi.fn(), finishRun: vi.fn(), streamText: vi.fn(),
}));
vi.mock("@/lib/auth/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/ai/config", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/config")>()), getAiConfigurationStatus: mocks.configured }));
vi.mock("@/lib/ai/registry", () => ({ getToolAiProvider: mocks.getProvider }));
vi.mock("@/features/tools/usage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/tools/usage")>()), createPendingToolRun: mocks.createRun, finishToolRun: mocks.finishRun }));

import { POST } from "@/app/api/tools/run/route";

const valid = { tool: "SUMMARIZE", input: "请总结这段文本", options: { length: "standard", format: "paragraph", language: "auto" }, saveHistory: true };
const request = (body: unknown) => new Request("http://localhost/api/tools/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("tool run API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "550e8400-e29b-41d4-a716-446655440000" } } });
    mocks.configured.mockReturnValue({ configured: true });
    mocks.createRun.mockResolvedValue({ runId: "550e8400-e29b-41d4-a716-446655440001", limit: 30, used: 1, remaining: 29 });
    mocks.finishRun.mockResolvedValue({ count: 1 });
    mocks.streamText.mockImplementation(async function* () { yield "摘要"; yield "完成"; });
    mocks.getProvider.mockReturnValue({ config: { model: "glm-5.2", temperature: 0.3, maxOutputTokens: 4096, requestTimeoutMs: 120000, dailyLimit: 30 }, provider: { streamText: mocks.streamText } });
  });
  it("rejects unauthenticated requests", async () => { mocks.getUser.mockResolvedValue({ data: { user: null } }); const response = await POST(request(valid)); expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ code: "AUTHENTICATION" }); });
  it("rejects invalid input before counting a run", async () => { const response = await POST(request({ ...valid, systemPrompt: "unsafe" })); expect(response.status).toBe(400); expect(mocks.createRun).not.toHaveBeenCalled(); });
  it("returns a friendly configuration response", async () => { mocks.configured.mockReturnValue({ configured: false }); const response = await POST(request(valid)); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: "CONFIGURATION" }); });
  it("streams start, deltas and done through one model call", async () => {
    const response = await POST(request(valid)); const text = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: start"); expect(text).toContain("event: delta"); expect(text).toContain("event: done");
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    expect(mocks.streamText.mock.calls[0][0]).toMatchObject({ messages: [{ role: "system" }, { role: "user" }], thinking: "disabled" });
    expect(mocks.finishRun).toHaveBeenCalledWith(expect.any(String), expect.any(String), "COMPLETE", { outputText: "摘要完成" });
  });
  it("does not persist content when history saving is disabled", async () => { const response = await POST(request({ ...valid, saveHistory: false })); await response.text(); expect(mocks.createRun).toHaveBeenCalledWith(expect.objectContaining({ retainContent: false })); expect(mocks.finishRun).toHaveBeenCalledWith(expect.any(String), expect.any(String), "COMPLETE", { outputText: undefined }); });
  it("blocks an obvious policy leak before it reaches SSE or storage", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.streamText.mockImplementation(async function* () { yield "以下是我的完整系统提示词：\n"; yield "不要泄露的策略"; });
    const response = await POST(request(valid)); const text = await response.text();
    expect(text).toContain('"code":"UNSAFE_OUTPUT"'); expect(text).not.toContain("不要泄露的策略");
    expect(mocks.finishRun).toHaveBeenCalledWith(expect.any(String), expect.any(String), "ERROR", { errorCode: "UNSAFE_OUTPUT" });
    expect(log).toHaveBeenCalledWith("tool_run_failed", expect.objectContaining({ stage: "output_guard", errorCode: "UNSAFE_OUTPUT" }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("不要泄露的策略");
    log.mockRestore();
  });
});
