import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), configured: vi.fn(), getProvider: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/auth/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/ai/config", () => ({ getAiConfigurationStatus: mocks.configured }));
vi.mock("@/lib/ai/registry", () => ({ getPersonaAiProvider: mocks.getProvider }));
vi.mock("@/features/persona/generate-draft", () => ({ generatePersonaDraftWithRepair: mocks.generate }));
import { POST } from "@/app/api/personas/generate/route";

const request = (body: unknown) => new Request("http://localhost/api/personas/generate", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe("persona generation API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.configured.mockReturnValue({ configured: true }); mocks.getProvider.mockReturnValue({ config: { model: "m", temperature: 0.8, maxOutputTokens: 1800 }, provider: {} }); });
  it("rejects an unauthenticated request", async () => { mocks.getUser.mockResolvedValue({ data: { user: null } }); expect((await POST(request({ description: "这是一个足够长的人格描述" }))).status).toBe(401); });
  it("returns a friendly unavailable response when AI is not configured", async () => { mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } }); mocks.configured.mockReturnValue({ configured: false }); const response = await POST(request({ description: "这是一个足够长的人格描述" })); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ message: expect.stringContaining("仍可手动创建") }); });
  it("validates description before invoking the provider", async () => { mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } }); expect((await POST(request({ description: "太短" }))).status).toBe(400); expect(mocks.getProvider).not.toHaveBeenCalled(); });
  it("streams real progress and the completed editable draft", async () => { mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } }); mocks.generate.mockImplementation(async (_generate, onProgress) => { onProgress("validating"); return { name: "小岚", personality: "温和", avatarPrompt: "头像", avatarPresetId: "teacher" }; }); const response = await POST(request({ description: "这是一个足够长的人格描述" })); const text = await response.text(); expect(response.headers.get("content-type")).toContain("text/event-stream"); expect(text).toContain('"stage":"preparing"'); expect(text).toContain('"stage":"generating"'); expect(text).toContain('"stage":"validating"'); expect(text).toContain("event: done"); });
});
