import { readFileSync } from "node:fs";
import { join } from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { capabilityDescriptorSchema, defineServerCapability } from "@/features/demos/runtime/capability";
import { apiErrorSchema } from "@/features/demos/runtime/errors";
import { executeRun, type RunEvent } from "@/features/demos/runtime/executor";
import { createDemoApiDeps, handleCreateRun, handleGetCapability, handleListCapabilities, type DemoApiDeps } from "@/features/demos/runtime/handlers";
import { readBoundedText } from "@/features/demos/runtime/http";
import { buildOpenApiDocument } from "@/features/demos/runtime/openapi";
import { examples } from "@/features/demos/runtime/openapi-examples";
import { ConcurrencyGate, SlidingWindowLimiter } from "@/features/demos/runtime/rate-limit";
import { RUN_ID_PATTERN, runSchemaFor } from "@/features/demos/runtime/run";
import { routeOptimizerCapability } from "@/features/demos/route-optimizer/capability";
import { routeInputSchema, routeOutputSchema } from "@/features/demos/route-optimizer/schema";

const runSchema = runSchemaFor(routeOutputSchema);
const BASE = "http://localhost/api/demo/v1";

function post(body: unknown, init: { headers?: Record<string, string>; raw?: string; ip?: string } = {}) {
  return new Request(`${BASE}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": init.ip ?? "203.0.113.7", ...init.headers },
    body: init.raw ?? JSON.stringify(body),
  });
}

function deps(overrides: Partial<DemoApiDeps> = {}): DemoApiDeps {
  return { ...createDemoApiDeps(), ...overrides };
}

const small = { capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 30, seed: 3 } } };

async function readSse(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      return { event, data: data ? JSON.parse(data) : undefined };
    });
}

describe("POST /api/demo/v1/runs", () => {
  it("runs the route optimizer and returns the terminal run as JSON", async () => {
    const response = await handleCreateRun(post(examples.requests.instance), deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("ratelimit-remaining")).toBe("19");
    const run = runSchema.parse(await response.json());
    expect(run.status).toBe("SUCCEEDED");
    expect(run.id).toMatch(RUN_ID_PATTERN);
    expect(response.headers.get("x-run-id")).toBe(run.id);
    expect(run.transitions.map((t) => t.status)).toEqual(["PENDING", "ACCEPTED", "RUNNING", "SUCCEEDED"]);
    expect(run.output?.points).toHaveLength(120);
    expect(run.output!.length).toBeLessThanOrEqual(run.output!.initialLength);
    expect(run.output!.length).toBeGreaterThanOrEqual(run.output!.lowerBound);
  });

  it("streams the lifecycle and progress as server-sent events", async () => {
    const response = await handleCreateRun(post(small, { headers: { accept: "text/event-stream" } }), deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = await readSse(response);
    const statuses = events.filter((e) => e.event === "run.status").map((e) => e.data.status);
    expect(statuses).toEqual(["PENDING", "ACCEPTED", "RUNNING", "SUCCEEDED"]);
    const progress = events.filter((e) => e.event === "run.progress");
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0].data.data.tour).toHaveLength(30);
    expect(runSchema.parse(events.at(-1)!.data).output?.tour).toHaveLength(30);
  });

  it("returns TIMED_OUT with the best tour so far when the deadline is reached", async () => {
    const response = await handleCreateRun(
      post({ capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 400, seed: 1 }, improvement: "annealing", annealingIterations: 3_000_000, deadlineMs: 50 } }),
      deps(),
    );
    const run = runSchema.parse(await response.json());
    expect(run.status).toBe("TIMED_OUT");
    expect(run.error?.code).toBe("DEADLINE_EXCEEDED");
    expect(run.output?.partial).toBe(true);
    expect(run.output?.stopReason).toBe("deadline");
    expect(run.output?.tour).toHaveLength(400);
  });

  it.each([
    ["415 for a non-JSON body", () => post(small, { headers: { "content-type": "text/plain" } }), 415, "UNSUPPORTED_MEDIA_TYPE"],
    ["400 for malformed JSON", () => post(null, { raw: "{\"capability\":" }), 400, "INVALID_REQUEST"],
    ["400 for an empty body", () => post(null, { raw: "" }), 400, "INVALID_REQUEST"],
    ["400 for a wrong envelope", () => post({ capability: "route-optimizer.solve", input: {}, extra: 1 }), 400, "INVALID_REQUEST"],
    ["404 for an unknown capability", () => post({ capability: "nope.run", input: {} }), 404, "NOT_FOUND"],
    ["422 for a browser capability", () => post({ capability: "neural-network.train", input: {} }), 422, "SEMANTIC_REJECTION"],
    ["400 for input outside the schema", () => post({ capability: "route-optimizer.solve", input: { points: [[1, 2]] } }), 400, "INVALID_REQUEST"],
    ["400 when both points and instance are sent", () => post({ capability: "route-optimizer.solve", input: { points: [[1, 2], [3, 4], [5, 6]], instance: { kind: "grid", count: 9 } } }), 400, "INVALID_REQUEST"],
    ["400 for coordinates outside the plane", () => post({ capability: "route-optimizer.solve", input: { points: [[1, 2], [3, 4], [5, -6]] } }), 400, "INVALID_REQUEST"],
    ["422 when startIndex is not a city", () => post({ capability: "route-optimizer.solve", input: { points: [[1, 2], [3, 4], [5, 6]], startIndex: 3 } }), 422, "SEMANTIC_REJECTION"],
  ])("%s", async (_name, make, status, code) => {
    const response = await handleCreateRun(make(), deps());
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = apiErrorSchema.parse(await response.json());
    expect(body.code).toBe(code);
    expect(JSON.stringify(body)).not.toMatch(/at \w+ \(|node_modules|\\\\/);
  });

  it("lists issues with paths into the request body", async () => {
    const response = await handleCreateRun(post({ capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 999 } } }), deps());
    const body = apiErrorSchema.parse(await response.json());
    expect(body.issues?.[0].path).toBe("input.instance.count");
  });

  it("rejects bodies over 64 KiB by header and by actual bytes", async () => {
    const big = JSON.stringify({ capability: "route-optimizer.solve", input: { points: [], pad: "x".repeat(70_000) } });
    const declared = await handleCreateRun(post(null, { raw: big }), deps());
    expect(declared.status).toBe(413);
    const lying = await handleCreateRun(post(null, { raw: big, headers: { "content-length": "10" } }), deps());
    expect(lying.status).toBe(413);
    await expect(readBoundedText(new Request("http://x", { method: "POST", body: "y".repeat(11) }), 10)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rate limits per client with Retry-After and keeps clients apart", async () => {
    let now = 1_000_000;
    const d = deps({ limiter: new SlidingWindowLimiter(2, 60_000), now: () => now });
    expect((await handleCreateRun(post(small), d)).status).toBe(200);
    expect((await handleCreateRun(post(small), d)).status).toBe(200);
    const limited = await handleCreateRun(post(small), d);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(apiErrorSchema.parse(await limited.json()).code).toBe("RATE_LIMITED");
    expect((await handleCreateRun(post(small, { ip: "198.51.100.9" }), d)).status).toBe(200);
    now += 60_001;
    expect((await handleCreateRun(post(small), d)).status).toBe(200);
  });

  it("caps concurrent runs per client and releases the slot afterwards", async () => {
    const gate = new ConcurrencyGate(8, 1);
    const d = deps({ gate });
    const held = gate.acquire("203.0.113.7")!;
    expect((await handleCreateRun(post(small), d)).status).toBe(429);
    held();
    expect((await handleCreateRun(post(small), d)).status).toBe(200);
    expect(gate.active()).toBe(0);
    expect((await handleCreateRun(post(null, { raw: "{" }), d)).status).toBe(400);
    expect(gate.active()).toBe(0);
  });

  it("cancels the run when the client disconnects", async () => {
    const controller = new AbortController();
    const request = new Request(`${BASE}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "192.0.2.1" },
      body: JSON.stringify({ capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 400, seed: 2 }, improvement: "annealing", annealingIterations: 3_000_000, deadlineMs: 5000 } }),
      signal: controller.signal,
    });
    const pending = handleCreateRun(request, deps());
    setTimeout(() => controller.abort(), 30);
    const run = runSchema.parse(await (await pending).json());
    expect(run.status).toBe("CANCELLED");
    expect(run.error?.code).toBe("CANCELLED");
  });
});

describe("capability discovery", () => {
  it("lists both demo capabilities with valid descriptors", async () => {
    const body = await handleListCapabilities(deps()).json();
    const list = z.object({ object: z.literal("list"), data: z.array(capabilityDescriptorSchema) }).parse(body);
    expect(list.data.map((c) => [c.id, c.execution])).toEqual([
      ["route-optimizer.solve", "server"],
      ["neural-network.train", "browser"],
    ]);
    expect(list.data[0].inputSchema).toMatchObject({ type: "object", additionalProperties: false });
  });

  it("gets one capability or returns 404", async () => {
    expect((await handleGetCapability("route-optimizer.solve", deps()).json()).limits.maxDeadlineMs).toBe(5000);
    const missing = handleGetCapability("../etc", deps());
    expect(missing.status).toBe(404);
    expect(apiErrorSchema.parse(await missing.json()).code).toBe("NOT_FOUND");
  });
});

describe("executeRun", () => {
  const base = { id: "test.echo", project: "test-project", version: "0.1.0", title: "t", summary: "s", dataFlow: "platform" as const, status: "demo" as const, limits: { maxInputBytes: 100, defaultDeadlineMs: 100, maxDeadlineMs: 100 }, sourcePath: "x", docsPath: "/x" };
  const input = z.object({ n: z.number() });
  const output = z.object({ doubled: z.number() });

  it("marks a throwing capability FAILED without leaking its message", async () => {
    const cap = defineServerCapability({ descriptor: base, input, output, execute: async () => { throw new Error("secret /srv/key=abc"); } });
    const run = await executeRun(cap, { n: 1 }, { requestId: crypto.randomUUID(), deadlineMs: 100 });
    expect(run.status).toBe("FAILED");
    expect(run.error?.code).toBe("CAPABILITY_ERROR");
    expect(JSON.stringify(run)).not.toContain("secret");
  });

  it("marks an output that breaks the contract FAILED", async () => {
    const cap = defineServerCapability({ descriptor: base, input, output, execute: async () => ({ doubled: "two" }) as never });
    const run = await executeRun(cap, { n: 1 }, { requestId: crypto.randomUUID(), deadlineMs: 100 });
    expect(run.error?.code).toBe("INVALID_OUTPUT");
  });

  it("stops waiting for a capability that ignores its deadline", async () => {
    const cap = defineServerCapability({ descriptor: base, input, output, execute: () => new Promise<never>(() => {}) });
    const events: RunEvent[] = [];
    const run = await executeRun(cap, { n: 1 }, { requestId: crypto.randomUUID(), deadlineMs: 20, graceMs: 10, onEvent: (e) => events.push(e) });
    expect(run.status).toBe("TIMED_OUT");
    expect(run.output).toBeNull();
    expect(events.filter((e) => e.type === "status").map((e) => (e.type === "status" ? e.run.status : ""))).toEqual(["PENDING", "ACCEPTED", "RUNNING", "TIMED_OUT"]);
  });

  it("succeeds and records durations", async () => {
    const cap = defineServerCapability({ descriptor: base, input, output, execute: async (value) => ({ doubled: value.n * 2 }) });
    const run = await executeRun(cap, { n: 21 }, { requestId: crypto.randomUUID(), deadlineMs: 100 });
    expect(run).toMatchObject({ status: "SUCCEEDED", output: { doubled: 42 }, error: null });
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("rate limiter", () => {
  it("slides the window and evicts the stalest keys", () => {
    const limiter = new SlidingWindowLimiter(2, 1000, 3);
    expect(limiter.take("a", 0).ok).toBe(true);
    expect(limiter.take("a", 10).remaining).toBe(0);
    expect(limiter.take("a", 20)).toMatchObject({ ok: false, resetSeconds: 1 });
    expect(limiter.take("a", 1001).ok).toBe(true);
    ["b", "c", "d", "e"].forEach((key) => limiter.take(key, 1100));
    expect(limiter.size()).toBe(3);
  });
});

describe("OpenAPI document", () => {
  const document = buildOpenApiDocument();

  it("is a valid OpenAPI 3.1 document", async () => {
    await expect(SwaggerParser.validate(structuredClone(document) as never)).resolves.toBeTruthy();
  });

  it("matches the committed docs/developer/openapi.json (run pnpm docs:openapi)", () => {
    const committed = JSON.parse(readFileSync(join(process.cwd(), "docs/developer/openapi.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(document)));
  });

  it("documents every route that exists", () => {
    expect(Object.keys(document.paths).sort()).toEqual(["/api/demo/v1/capabilities", "/api/demo/v1/capabilities/{capabilityId}", "/api/demo/v1/openapi.json", "/api/demo/v1/runs"]);
  });

  it("has examples that pass the runtime schemas", () => {
    for (const request of Object.values(examples.requests)) routeInputSchema.parse(request.input);
    runSchema.parse(examples.run);
    for (const error of Object.values(examples.errors)) apiErrorSchema.parse(error);
  });

  it("uses a real solver result as the run example", async () => {
    const input = routeOptimizerCapability.input.parse(examples.requests.points.input);
    const run = await executeRun(routeOptimizerCapability, input, { requestId: crypto.randomUUID(), deadlineMs: 3000 });
    const timing = (output: object) => Object.fromEntries(Object.entries(output).filter(([key]) => key !== "elapsedMs" && key !== "convergence"));
    expect(timing(run.output!)).toEqual(timing(examples.run.output));
  });
});
