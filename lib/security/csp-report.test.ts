import { afterEach, describe, expect, it, vi } from "vitest";
import { createCspReportHandler } from "./csp-report";
import webkitReport from "../../tests/fixtures/csp-webkit-report.json";

const endpoint = "https://app.example/api/security/csp-report";
const legacy = (extra = {}) => ({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "inline", disposition: "report", ...extra } });
const request = (value: unknown, type = "application/csp-report") => new Request(endpoint, { method: "POST", headers: { "Content-Type": type }, body: JSON.stringify(value) });
afterEach(() => { vi.useRealTimers(); });

describe("bounded anonymous CSP reporting", () => {
  it("accepts WebKit's native legacy shape without inventing its missing disposition", async () => {
    const log = vi.fn();
    const response = await createCspReportHandler({ log })(request(webkitReport));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(log).toHaveBeenCalledExactlyOnceWith({ directive: "script-src-elem", disposition: "unspecified", blocked: "inline" });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/example|memories|original-policy|document-uri/);
  });

  it("does not treat missing Reporting API disposition as a legacy WebKit claim", async () => {
    const log = vi.fn();
    const response = await createCspReportHandler({ log })(request([{ type: "csp-violation", body: { effectiveDirective: "script-src-elem", blockedURL: "inline" } }], "application/reports+json"));
    expect(response.status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });

  it("accepts legacy reports and logs fixed-vocabulary fields only", async () => {
    const log = vi.fn();
    const response = await createCspReportHandler({ log })(request(legacy({ "document-uri": "https://app.example/?code=secret", "script-sample": "secret sample", "source-file": "https://app.example/?token=secret" })));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(log).toHaveBeenCalledExactlyOnceWith({ directive: "script-src-elem", disposition: "report", blocked: "inline" });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|https|sample|token|code=/);
  });

  it("accepts bounded Reporting API batches without retaining URLs", async () => {
    const log = vi.fn();
    const response = await createCspReportHandler({ log })(request([{ type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://cdn.example/private?token=secret", disposition: "report" } }], "application/reports+json; charset=utf-8"));
    expect(response.status).toBe(204);
    expect(log).toHaveBeenCalledExactlyOnceWith({ directive: "img-src", disposition: "report", blocked: "external-https" });
  });

  it.each([null, {}, [], legacy({ disposition: "enforce" }), legacy({ disposition: null }), legacy({ disposition: "unknown" }), legacy({ "effective-directive": "arbitrary attacker text" })])("rejects malformed or unrelated claims without reflecting them", async (value) => {
    const log = vi.fn();
    const response = await createCspReportHandler({ log })(request(value));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("");
    expect(log).not.toHaveBeenCalled();
  });

  it("rejects unsupported types and malformed JSON", async () => {
    const handler = createCspReportHandler({ log: vi.fn() });
    expect((await handler(request(legacy(), "application/json"))).status).toBe(415);
    expect((await handler(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: "{" }))).status).toBe(400);
  });

  it("bounds both declared and actual body bytes and report counts", async () => {
    const log = vi.fn();
    const handler = createCspReportHandler({ log });
    const declared = request(legacy());
    declared.headers.set("Content-Length", "16385");
    expect((await handler(declared)).status).toBe(413);
    expect((await handler(request(legacy({ ignored: "x".repeat(16385) })))).status).toBe(413);
    expect((await handler(request(Array.from({ length: 9 }, () => ({ type: "csp-violation", body: {} })), "application/reports+json"))).status).toBe(413);
    expect(log).not.toHaveBeenCalled();
  });

  it("rate limits in fixed memory without IP identifiers and permits the next window", async () => {
    let now = 100_000;
    const log = vi.fn();
    const handler = createCspReportHandler({ now: () => now, log });
    for (let i = 0; i < 60; i++) expect((await handler(request(legacy()))).status).toBe(204);
    const blocked = await handler(request(legacy()));
    expect(blocked.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(60);
    now += 60_000;
    expect((await handler(request(legacy()))).status).toBe(204);
    expect(log).toHaveBeenCalledTimes(61);
  });

  it("cancels a stalled report body within the read deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const stalled = new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: stream, duplex: "half" } as RequestInit);
    const response = createCspReportHandler({ log: vi.fn() })(stalled);
    await vi.advanceTimersByTimeAsync(2_001);
    expect((await response).status).toBe(400);
    expect(cancel).toHaveBeenCalled();
  });
});
