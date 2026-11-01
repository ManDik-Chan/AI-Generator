import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), validate: vi.fn() }));
vi.mock("@/lib/auth/supabase/server", () => ({ createSupabaseServerClient: mocks.create }));
vi.mock("@/lib/auth/supabase/validated-user", () => ({ getValidatedUser: mocks.validate }));
import { GET } from "./route";

beforeEach(() => { vi.resetAllMocks(); mocks.create.mockResolvedValue({ auth: "synthetic-client" }); });
const request = (viewer = "synthetic") => new Request("http://127.0.0.1/api/auth/session", { headers: { "x-aig-viewer": viewer } });
describe("returning-tab server session check", () => {
  it("returns an empty private response only for a server-validated session", async () => {
    mocks.validate.mockResolvedValue({ id: "synthetic", email: "synthetic@example.test" });
    const response = await GET(request());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(mocks.validate).toHaveBeenCalledWith({ auth: "synthetic-client" });
  });
  it("rejects missing, expired or revoked sessions without returning credentials", async () => {
    mocks.validate.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("does not claim validity or leak service errors when unavailable", async () => {
    mocks.create.mockRejectedValue(new Error("synthetic internal details"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("rejects a changed account so old cached viewer data cannot survive tab return", async () => {
    mocks.validate.mockResolvedValue({ id: "new-viewer" });
    const response = await GET(request("previous-viewer"));
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("");
  });
});
