import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";

import {
  getUnexpectedRuntimeErrors,
  flushRuntimeDiagnostics,
  type RuntimeDiagnostics,
} from "./runtime-diagnostics";
import { expectedCspPolicy } from "./csp-observations";

const webkitLoadFailed = "console: TypeError: Load failed (http://127.0.0.1:3000/_next/static/chunks/app.js:0:42)";

function diagnostics(
  overrides: Partial<RuntimeDiagnostics> = {},
): RuntimeDiagnostics {
  return {
    errors: [webkitLoadFailed],
    requestFailures: [{
      failure: "Load request cancelled",
      initiator: "unavailable-in-playwright-webkit",
      isNavigationRequest: false,
      method: "POST",
      pageUrl: "http://127.0.0.1:3000/memories",
      resourceType: "fetch",
      responseStatus: 200,
      url: "http://127.0.0.1:3000/memories",
    }],
    ...overrides,
  };
}

describe("authenticated E2E runtime diagnostics", () => {
  it("does not evaluate a closed fixture page or discard the evidence already collected", async () => {
    const evaluate = vi.fn();
    await flushRuntimeDiagnostics({ isClosed: () => true, evaluate } as unknown as Page);
    expect(evaluate).not.toHaveBeenCalled();
    const error = "page: ReferenceError: retained after close";
    expect(getUnexpectedRuntimeErrors(diagnostics({ errors: [error] }))).toEqual([error]);
  });
  it("pairs one WebKit Next chunk Load failed with one completed Memory action navigation cancellation", () => {
    expect(getUnexpectedRuntimeErrors(diagnostics())).toEqual([]);
  });

  it("does not hide extra Load failed errors without matching completed actions", () => {
    expect(getUnexpectedRuntimeErrors(diagnostics({
      errors: [webkitLoadFailed, webkitLoadFailed],
    }))).toEqual([webkitLoadFailed]);
  });

  it.each([
    { method: "GET" },
    { responseStatus: 500 },
    { url: "http://127.0.0.1:3000/api/chat" },
    { failure: "net::ERR_CONNECTION_RESET" },
    { isNavigationRequest: true },
  ])("does not classify a non-matching request as an expected cancellation: %o", (change) => {
    const input = diagnostics();
    Object.assign(input.requestFailures[0]!, change);
    expect(getUnexpectedRuntimeErrors(input)).toEqual([webkitLoadFailed]);
  });

  it("never hides a page error", () => {
    const pageError = "page: TypeError: Load failed";
    expect(getUnexpectedRuntimeErrors(diagnostics({
      errors: [pageError],
    }))).toEqual([pageError]);
  });

  it("retains page errors and extra console errors alongside a paired CSP observation", () => {
    const origin = "http://127.0.0.1:3000";
    const text = "[Report Only] Refused to execute a script because its hash, its nonce, or 'unsafe-inline' does not appear in the script-src directive of the Content Security Policy.";
    const error = `console: ${text} (${origin}/login:1:0)`;
    const input = diagnostics({
      errors: [error, error, "page: ReferenceError: real failure"], requestFailures: [],
      cspEvents: [{ blockedURI: "inline", disposition: "report", effectiveDirective: "script-src-elem", originalPolicy: expectedCspPolicy, documentOrigin: origin, sourceOrigin: origin, frameOrigin: origin }],
      cspConsole: [{ text, origin, error }, { text, origin, error }],
    });
    expect(getUnexpectedRuntimeErrors(input)).toEqual([error, "page: ReferenceError: real failure"]);
  });
});
