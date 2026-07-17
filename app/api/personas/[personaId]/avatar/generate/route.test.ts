import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageProviderError } from "@/lib/ai/image/errors";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), generate: vi.fn(), remove: vi.fn(), createRun: vi.fn(), pending: vi.fn(), finish: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/features/persona/avatar-service", () => ({ generatePersonaAvatarCandidate: mocks.generate, deleteGeneratedAvatar: mocks.remove }));
vi.mock("@/features/generation/runs", () => ({ createGenerationRun: mocks.createRun, isGenerationRunPending: mocks.pending, finishGenerationRun: mocks.finish }));

import { POST } from "@/app/api/personas/[personaId]/avatar/generate/route";

describe("persona avatar generation diagnostics", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getCurrentUser.mockResolvedValue({ id: "owner" }); mocks.createRun.mockResolvedValue({ id: "run" }); mocks.pending.mockResolvedValue(true); mocks.finish.mockResolvedValue({ count: 1 }); });

  it("logs sanitized diagnostics while the browser receives only a friendly message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generate.mockRejectedValue(new ImageProviderError("UNSAFE_IMAGE", "https://cdn.example/a?token=secret-key", undefined, { stage: "content-type", hostname: "cdn.example", declaredType: "text/html" }));
    const response = await POST(new Request("http://localhost/api/personas/id/avatar/generate", { method: "POST", body: JSON.stringify({ prompt: "安全头像" }) }), { params: Promise.resolve({ personaId: "550e8400-e29b-41d4-a716-446655440001" }) });
    const body = await response.text(); const logged = JSON.stringify(warn.mock.calls);
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toContain("text/event-stream"); expect(body).toContain("图片 CDN 返回类型异常");
    expect(body).not.toContain("cdn.example"); expect(body).not.toContain("token="); expect(body).not.toContain("secret-key");
    expect(logged).toContain('"stage":"content-type"'); expect(logged).toContain('"hostname":"cdn.example"');
    expect(logged).not.toContain("token="); expect(logged).not.toContain("secret-key"); expect(logged).not.toContain("https://");
  });

  it("streams only safe real stages and the final candidate", async () => {
    const stages = ["preparing", "generating", "downloading", "validating", "uploading", "saving"];
    mocks.generate.mockImplementation(async (_userId, _personaId, _prompt, _signal, onProgress) => { stages.forEach((stage) => onProgress(stage)); return { generatedImageId: "image-id", previewUrl: "/api/generated-images/image-id", prompt: "头像", width: 1280, height: 1280 }; });
    const response = await POST(new Request("http://localhost/api/personas/id/avatar/generate", { method: "POST", body: JSON.stringify({ prompt: "安全头像" }) }), { params: Promise.resolve({ personaId: "550e8400-e29b-41d4-a716-446655440001" }) }); const body = await response.text();
    for (const stage of stages) expect(body).toContain(`\"stage\":\"${stage}\"`);
    expect(body).toContain("event: done"); expect(body).not.toContain("https://"); expect(body).not.toContain("storagePath"); expect(body).not.toContain("API_KEY");
  });
});
