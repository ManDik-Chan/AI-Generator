import { expect, type Page, type TestInfo } from "@playwright/test";
import { pairCspObservations, urlOrigin, type CspConsoleObservation, type CspObservation } from "./csp-observations";

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
  cspEvents?: CspObservation[];
  cspConsole?: CspConsoleObservation[];
  pendingRequestDiagnostics?: Promise<void>[];
  requestFailures: RequestFailureDiagnostic[];
}

export async function installRuntimeDiagnostics(page: Page): Promise<RuntimeDiagnostics> {
  const diagnostics: RuntimeDiagnostics = {
    errors: [],
    pendingRequestDiagnostics: [],
    requestFailures: [],
    cspEvents: [],
    cspConsole: [],
  };
  await page.exposeBinding("__aigObserveCsp", ({ frame }, event: Record<string, unknown>) => {
    diagnostics.cspEvents!.push({
      blockedURI: event.blockedURI === "inline" || event.blockedURI === "eval" ? event.blockedURI : "other",
      disposition: typeof event.disposition === "string" ? event.disposition : "",
      effectiveDirective: typeof event.effectiveDirective === "string" ? event.effectiveDirective : "",
      originalPolicy: typeof event.originalPolicy === "string" ? event.originalPolicy : "",
      documentOrigin: urlOrigin(typeof event.documentURI === "string" ? event.documentURI : ""),
      sourceOrigin: urlOrigin(typeof event.sourceFile === "string" ? event.sourceFile : ""),
      frameOrigin: urlOrigin(frame.url()),
    });
  });
  await page.addInitScript(() => {
    const pending = new Set<Promise<void>>();
    Object.defineProperty(window, "__aigDrainCsp", { value: async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await Promise.all([...pending]);
    } });
    document.addEventListener("securitypolicyviolation", (event) => {
      if (!event.isTrusted) return;
      const observe = (window as unknown as { __aigObserveCsp: (value: unknown) => Promise<void> }).__aigObserveCsp;
      const task = observe({ blockedURI: event.blockedURI, disposition: event.disposition, effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy, documentURI: event.documentURI, sourceFile: event.sourceFile });
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
  });
  page.on("console", (message) => {
    const location = message.location();
    const suffix = location.url
      ? ` (${location.url}:${location.lineNumber ?? 0}:${location.columnNumber ?? 0})`
      : "";
    const error = message.type() === "error" ? `console: ${message.text()}${suffix}` : undefined;
    if (error) diagnostics.errors.push(error);
    if (message.text().includes("Content Security Policy") && (message.text().startsWith("[Report Only]") || message.text().includes("The policy is report-only"))) {
      diagnostics.cspConsole!.push({ text: message.text(), origin: urlOrigin(location.url), error });
    }
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

/** Drain the browser event queue and its binding deliveries before assertions. */
export async function flushRuntimeDiagnostics(page: Page) {
  // Fixture cleanup deliberately closes the page before afterEach. Keep the
  // collected evidence/assertions; only a live document can drain its queue.
  if (page.isClosed()) return;
  await page.evaluate(async () => {
    await (window as unknown as { __aigDrainCsp?: () => Promise<void> }).__aigDrainCsp?.();
  });
}

export function getUnexpectedRuntimeErrors(diagnostics: RuntimeDiagnostics) {
  // WebKit can cancel the RSC response tail when a completed /memories Server
  // Action immediately changes the rendered tree. We only pair that console
  // signature with a same-origin, non-navigation POST that already returned
  // HTTP 200; the unfiltered diagnostics attachment still retains both events.
  const expectedCancellations = diagnostics.requestFailures
    .filter(isCompletedMemoryActionNavigationCancellation)
    .map((failure) => new URL(failure.url).origin);
  const csp = pairCspObservations(diagnostics.cspEvents ?? [], diagnostics.cspConsole ?? []);
  const unexpectedErrors = diagnostics.errors.filter((error) => {
    const cspIndex = csp.expectedErrors.indexOf(error);
    if (cspIndex >= 0) { csp.expectedErrors.splice(cspIndex, 1); return false; }
    const matchIndex = expectedCancellations.findIndex(
      (origin) => isWebKitNextChunkLoadCancellation(error, origin),
    );
    if (matchIndex < 0) return true;
    expectedCancellations.splice(matchIndex, 1);
    return false;
  });
  return [...unexpectedErrors, ...csp.unexpected];
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
  if (!diagnostics.errors.length && !diagnostics.requestFailures.length && !diagnostics.cspEvents?.length) return;
  await testInfo.attach("runtime-diagnostics", {
    body: Buffer.from(JSON.stringify({
      errors: diagnostics.errors,
      requestFailures: diagnostics.requestFailures,
      cspEvents: diagnostics.cspEvents,
      cspConsole: diagnostics.cspConsole,
    }, null, 2)),
    contentType: "application/json",
  });
}
