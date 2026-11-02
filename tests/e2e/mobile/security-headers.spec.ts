import { expect, test } from "@playwright/test";
import { assertSecurityHeaderContract } from "../../security/header-contract";
import { attachRuntimeDiagnostics, expectNoRuntimeErrors, flushRuntimeDiagnostics, installRuntimeDiagnostics } from "../support/runtime-diagnostics";

// Existing CI browser matrix only; this file grants no local browser permission.
test.use({ storageState: { cookies: [], origins: [] } });

test("security policy covers pages, redirects, errors, API and static assets", async ({ request }) => {
  for (const [path, statuses] of [
    ["/", [200]], ["/login", [200]], ["/register", [200]], ["/__security_header_missing_page__", [404]],
    ["/workspace", [307, 303]], ["/auth/callback", [307, 303]], ["/api/demo/v1/capabilities", [200]],
    ["/api/security/csp-report", [405]], ["/favicon.ico", [200]],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(statuses as readonly number[]).toContain(response.status());
    assertSecurityHeaderContract(new Headers(response.headers()));
  }
  const rsc = await request.get("/?_rsc=security-header-browser", { headers: { RSC: "1" } });
  expect(rsc.headers()["content-type"]).toContain("text/x-component");
  assertSecurityHeaderContract(new Headers(rsc.headers()));
});

test("strict CSP reports inline execution while the application remains interactive", async ({ page }, testInfo) => {
  const diagnostics = await installRuntimeDiagnostics(page);
  // Insert into parser-delivered HTML, giving both browser reports and console
  // messages a document location. DevTools-evaluated script has no source URL.
  await page.route("**/login", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("</head>", "<script>window.__aigInlineProbeExecuted = true</script></head>");
    await route.fulfill({ response, body: html });
  });
  const response = await page.goto("/login");
  expect(response).not.toBeNull();
  assertSecurityHeaderContract(new Headers(response!.headers()));
  expect(response!.headers()["content-security-policy"]).toBeUndefined();
  await page.getByLabel("邮箱").fill("csp-probe@example.test");
  await expect(page.getByLabel("邮箱")).toHaveValue("csp-probe@example.test");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __aigInlineProbeExecuted?: boolean }).__aigInlineProbeExecuted)).toBe(true);
  await expect.poll(() => diagnostics.cspEvents?.filter((event) => event.disposition === "report" && event.blockedURI === "inline" && event.effectiveDirective === "script-src-elem").length ?? 0).toBeGreaterThan(0);
  await flushRuntimeDiagnostics(page);
  await attachRuntimeDiagnostics(testInfo, diagnostics);
  expectNoRuntimeErrors(diagnostics, "Only paired strict Report-Only inline observations are expected.");
});

test("X-Frame-Options denies a real same-origin frame independently of CSP reporting", async ({ page }) => {
  await page.goto("/login");
  const response = page.waitForResponse((candidate) => new URL(candidate.url()).searchParams.has("security-frame-probe"));
  const loaded = page.evaluate(() => new Promise<void>((resolve) => {
    const frame = document.createElement("iframe");
    frame.id = "security-framing-probe";
    frame.onload = () => resolve();
    frame.src = "/login?security-frame-probe=1";
    document.body.appendChild(frame);
  }));
  const framedResponse = await response;
  expect(framedResponse.status()).toBe(200);
  expect(framedResponse.headers()["x-frame-options"]).toBe("DENY");
  await loaded;
  expect(await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>("#security-framing-probe");
    try { return Boolean(frame?.contentDocument?.querySelector('input[type="email"]')); } catch { return false; }
  })).toBe(false);
});
