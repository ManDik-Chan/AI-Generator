import { describe, expect, it } from "vitest";

import {
  getUnexpectedRuntimeErrors,
  type RuntimeDiagnostics,
} from "./runtime-diagnostics";

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
});
