import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRegistryWriteHandler } from "./write-http";
import { MAX_JSON_BYTES } from "./canonical";

const create = vi.hoisted(() => vi.fn());
vi.mock("./internal", () => ({ createRegistryProjectCommand: create }));
const origin = "https://registry.example";
const projectId = "11111111-1111-4111-8111-111111111111";
function request(body = '{"slug":"example"}', headers: Record<string, string> = {}, method = "POST") {
  return new Request(`${origin}/api/internal/registry/projects`, {
    method, body, headers: {
      origin, authorization: "Bearer verified.token", "content-type": "application/json", "idempotency-key": "command",
      ...headers,
    },
  });
}

beforeEach(() => {
  vi.stubEnv("REGISTRY_INTERNAL_ACCESS_ENABLED", "true");
  vi.stubEnv("REGISTRY_INTERNAL_WRITE_HTTP_ENABLED", "true");
  vi.stubEnv("REGISTRY_DRAFT_REVIEW_ENABLED", "true");
  create.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ['{"slug":"example","slug":"second"}', {}, 422, "INVALID_INPUT"],
  ['{"slug":"example","ownerId":"forged"}', {}, 422, "INVALID_INPUT"],
  [" ".repeat(MAX_JSON_BYTES + 1), {}, 413, "PAYLOAD_TOO_LARGE"],
  ["{}", { "content-encoding": "gzip" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
  ["{}", { origin: "https://other.example" }, 403, "FORBIDDEN"],
  ["{}", { "sec-fetch-site": "cross-site" }, 403, "FORBIDDEN"],
  ["{}", { authorization: "" }, 401, "AUTH_REQUIRED"],
] as const)("rejects invalid writes at the HTTP boundary (%#)", async (body, headers, status, code) => {
  const result = await createRegistryWriteHandler()(request(body, headers), ["projects"]);
  expect(result.status).toBe(status);
  expect(await result.json()).toEqual({ code });
  expect(create).not.toHaveBeenCalled();
});

it("requires a draft precondition and the existing draft service gate", async () => {
  const handler = createRegistryWriteHandler();
  const path = ["projects", projectId, "draft"];
  expect((await handler(request("{}", {}, "PUT"), path)).status).toBe(428);
  vi.stubEnv("REGISTRY_DRAFT_REVIEW_ENABLED", "");
  expect((await handler(request("{}", {}, "PUT"), path)).status).toBe(403);
});

it("enforces the write budget before invoking the command and resets it on the next window", async () => {
  let now = 0;
  const handler = createRegistryWriteHandler(() => now);
  const path = ["projects"];
  create.mockResolvedValue({ result: { id: projectId, slug: "example" }, replayed: false });
  for (let i = 0; i < 20; i++) expect((await handler(request(), path)).status).toBe(201);
  const limited = await handler(request(), path);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
  expect(create).toHaveBeenCalledTimes(20);
  now = 60_000;
  expect((await handler(request(), path)).status).toBe(201);
});
