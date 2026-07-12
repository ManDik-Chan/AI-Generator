import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageProviderError } from "@/lib/ai/image/errors";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/features/persona/avatar-service", () => ({ generatePersonaAvatarCandidate: mocks.generate }));

import { POST } from "@/app/api/personas/[personaId]/avatar/generate/route";

describe("persona avatar generation diagnostics", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getCurrentUser.mockResolvedValue({ id: "owner" }); });

  it("logs sanitized diagnostics while the browser receives only a friendly message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.generate.mockRejectedValue(new ImageProviderError("UNSAFE_IMAGE", "https://cdn.example/a?token=secret-key", undefined, { stage: "content-type", hostname: "cdn.example", declaredType: "text/html" }));
    const response = await POST(new Request("http://localhost/api/personas/id/avatar/generate", { method: "POST", body: JSON.stringify({ prompt: "安全头像" }) }), { params: Promise.resolve({ personaId: "550e8400-e29b-41d4-a716-446655440001" }) });
    const body = JSON.stringify(await response.json()); const logged = JSON.stringify(warn.mock.calls);
    expect(response.status).toBe(500); expect(body).toContain("图片 CDN 返回类型异常");
    expect(body).not.toContain("cdn.example"); expect(body).not.toContain("token="); expect(body).not.toContain("secret-key");
    expect(logged).toContain('"stage":"content-type"'); expect(logged).toContain('"hostname":"cdn.example"');
    expect(logged).not.toContain("token="); expect(logged).not.toContain("secret-key"); expect(logged).not.toContain("https://");
  });
});
