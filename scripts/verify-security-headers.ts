import assert from "node:assert/strict";
import { assertSecurityHeaderContract } from "../tests/security/header-contract";

// HTTP-only regression; never launches a browser or connects to a production app.
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.username || base.password || !["http:", "https:"].includes(base.protocol)) {
  throw new Error("Header regression requires an isolated loopback application origin.");
}
const results: Array<{ path: string; status: number }> = [];
async function check(path: string, statuses: number[], init?: RequestInit) {
  const response = await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(10_000), ...init });
  assert.ok(statuses.includes(response.status), `${path}: unexpected HTTP ${response.status}`);
  assertSecurityHeaderContract(response.headers);
  results.push({ path, status: response.status });
  return response;
}

async function main() {
  const home = await check("/", [200]);
  const html = await home.text();
  assert.equal(home.headers.get("content-security-policy"), null, "HTML CSP must remain Report-Only");
  for (const path of ["/login", "/register"]) await (await check(path, [200])).body?.cancel();
  await (await check("/__security_header_missing_page__", [404])).body?.cancel();
  await (await check("/workspace", [307, 303])).body?.cancel();
  await (await check("/auth/callback", [307, 303])).body?.cancel();
  await (await check("/api/demo/v1/capabilities", [200])).body?.cancel();
  await (await check("/api/demo/v1/runs", [400], { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).body?.cancel();
  await (await check("/api/security/csp-report", [405])).body?.cancel();
  await check("/api/security/csp-report", [400], { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: "{" });
  await check("/api/security/csp-report", [204], { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: JSON.stringify({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "inline", disposition: "report" } }) });
  await (await check("/favicon.ico", [200])).body?.cancel();
  for (const extension of ["js", "css"]) {
    const asset = html.match(new RegExp(`(?:src|href)="(/_next/static/[^" ]+\\.${extension})"`))?.[1];
    assert.ok(asset, `production HTML must reference a ${extension} asset`);
    await (await check(asset, [200])).body?.cancel();
  }
  const rsc = await check("/?_rsc=security-header-regression", [200], { headers: { RSC: "1" } });
  assert.match(rsc.headers.get("content-type") ?? "", /text\/x-component/);
  await rsc.body?.cancel();
  await (await check("/_next/image?url=%2Ficon.png&w=64&q=75", [200])).body?.cancel();
  console.info(JSON.stringify({ checked: results.length, results }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "HTTP security header regression failed");
  process.exitCode = 1;
});
