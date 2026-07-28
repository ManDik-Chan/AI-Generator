import { expect, type Page, type TestInfo } from "@playwright/test";

interface RequestFailureDiagnostic {
  failure: string;
  initiator: "unavailable-in-playwright-webkit";
  isNavigationRequest: boolean;
  method: string;
  pageUrl: string;
  resourceType: string;
  responseStatus: number | null;
  url: string;
}

function isCompletedMemoryActionNavigationCancellation(
  failure: RequestFailureDiagnostic,
) {
  try {
    const requestUrl = new URL(failure.url);
    const pageUrl = new URL(failure.pageUrl);
    return failure.failure === "Load request cancelled"
      && failure.method === "POST"
      && failure.resourceType === "fetch"
      && !failure.isNavigationRequest
      && failure.responseStatus === 200
      && requestUrl.pathname === "/memories"
      && pageUrl.pathname === "/memories"
      && requestUrl.origin === pageUrl.origin;
  } catch {
    return false;
  }
}

function isWebKitNextChunkLoadCancellation(error: string, origin: string) {
  return error.startsWith("console: TypeError: Load failed (")
    && error.includes(`${origin}/_next/static/chunks/`);
}

export interface RuntimeDiagnostics {
  errors: string[];
  pendingRequestDiagnostics?: Promise<void>[];
  requestFailures: RequestFailureDiagnostic[];
}

export function installRuntimeDiagnostics(page: Page): RuntimeDiagnostics {
  const diagnostics: RuntimeDiagnostics = {
    errors: [],
    pendingRequestDiagnostics: [],
    requestFailures: [],
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    const suffix = location.url
      ? ` (${location.url}:${location.lineNumber ?? 0}:${location.columnNumber ?? 0})`
      : "";
    diagnostics.errors.push(`console: ${message.text()}${suffix}`);
  });
  page.on("pageerror", (error) => {
    diagnostics.errors.push(`page: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure: RequestFailureDiagnostic = {
      failure: request.failure()?.errorText ?? "unknown",
      initiator: "unavailable-in-playwright-webkit",
      isNavigationRequest: request.isNavigationRequest(),
      method: request.method(),
      pageUrl: page.url(),
      resourceType: request.resourceType(),
      responseStatus: null,
      url: request.url(),
    };
    diagnostics.requestFailures.push(failure);
    diagnostics.pendingRequestDiagnostics?.push(
      request.response()
        .then((response) => {
          failure.responseStatus = response?.status() ?? null;
        })
        .catch(() => undefined),
    );
  });
  return diagnostics;
}

export function getUnexpectedRuntimeErrors(diagnostics: RuntimeDiagnostics) {
  // WebKit can cancel the RSC response tail when a completed /memories Server
  // Action immediately changes the rendered tree. We only pair that console
  // signature with a same-origin, non-navigation POST that already returned
  // HTTP 200; the unfiltered diagnostics attachment still retains both events.
  const expectedCancellations = diagnostics.requestFailures
    .filter(isCompletedMemoryActionNavigationCancellation)
    .map((failure) => new URL(failure.url).origin);
  return diagnostics.errors.filter((error) => {
    const matchIndex = expectedCancellations.findIndex(
      (origin) => isWebKitNextChunkLoadCancellation(error, origin),
    );
    if (matchIndex < 0) return true;
    expectedCancellations.splice(matchIndex, 1);
    return false;
  });
}

export function expectNoRuntimeErrors(
  diagnostics: RuntimeDiagnostics,
  stage: string,
) {
  expect(
    getUnexpectedRuntimeErrors(diagnostics),
    `${stage}\nRequest failures observed: ${JSON.stringify(diagnostics.requestFailures, null, 2)}`,
  ).toEqual([]);
}

export async function attachRuntimeDiagnostics(
  testInfo: TestInfo,
  diagnostics: RuntimeDiagnostics,
) {
  await Promise.all(diagnostics.pendingRequestDiagnostics ?? []);
  if (!diagnostics.errors.length && !diagnostics.requestFailures.length) return;
  await testInfo.attach("runtime-diagnostics", {
    body: Buffer.from(JSON.stringify({
      errors: diagnostics.errors,
      requestFailures: diagnostics.requestFailures,
    }, null, 2)),
    contentType: "application/json",
  });
}
