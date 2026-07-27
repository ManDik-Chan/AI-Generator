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

export function expectNoRuntimeErrors(
  diagnostics: RuntimeDiagnostics,
  stage: string,
) {
  expect(
    diagnostics.errors,
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
