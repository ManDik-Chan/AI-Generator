/*
 * pnpm demo:api-smoke [baseUrl]
 *
 * Calls the Demo Runtime API over real HTTP with the documented examples and checks
 * status codes and shapes. Read-only: it runs a handful of solver jobs (counts toward the
 * rate limit) and never touches a database. Default base URL: http://127.0.0.1:3000.
 */
import { solve } from "../examples/demo-api/solve.mjs";
import { streamRun } from "../examples/demo-api/stream.mjs";

const base = (process.argv[2] ?? process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
  }
}

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function post(body, headers = {}) {
  const response = await fetch(`${base}/api/demo/v1/runs`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  return { response, body: await response.json().catch(() => null) };
}

await check("GET capabilities", async () => {
  const response = await fetch(`${base}/api/demo/v1/capabilities`);
  const body = await response.json();
  expect(response.status === 200, `status ${response.status}`);
  expect(response.headers.get("cache-control") === "no-store", "missing no-store");
  return body.data.map((c) => `${c.id}:${c.execution}`).join(", ");
});

await check("GET capability (404)", async () => {
  const response = await fetch(`${base}/api/demo/v1/capabilities/unknown.thing`);
  const body = await response.json();
  expect(response.status === 404 && body.code === "NOT_FOUND", `got ${response.status} ${body.code}`);
  return body.code;
});

await check("GET openapi.json", async () => {
  const response = await fetch(`${base}/api/demo/v1/openapi.json`);
  const body = await response.json();
  expect(body.openapi === "3.1.0", "not OpenAPI 3.1");
  return `${Object.keys(body.paths).length} paths`;
});

await check("POST runs · JSON (examples/demo-api/solve.mjs)", async () => {
  const run = await solve(base);
  return `${run.status} · length ${run.output.length} · gap ${(run.output.gap * 100).toFixed(1)}% · ${run.durationMs} ms`;
});

await check("POST runs · SSE (examples/demo-api/stream.mjs)", async () => {
  const statuses = [];
  let progress = 0;
  const run = await streamRun(base, { onStatus: (r) => statuses.push(r.status), onProgress: () => (progress += 1) });
  expect(statuses.join(">") === "PENDING>ACCEPTED>RUNNING>SUCCEEDED", `statuses ${statuses.join(">")}`);
  return `${statuses.join(" → ")} · ${progress} progress events · length ${run.output.length}`;
});

await check("POST runs · deadline → TIMED_OUT with partial output", async () => {
  const { response, body } = await post(JSON.stringify({ capability: "route-optimizer.solve", input: { instance: { kind: "uniform", count: 400, seed: 1 }, improvement: "annealing", annealingIterations: 3000000, deadlineMs: 50 } }));
  expect(response.status === 200 && body.status === "TIMED_OUT" && body.output?.partial === true, `got ${response.status} ${body?.status}`);
  return `${body.status} · partial length ${body.output.length}`;
});

for (const [name, body, headers, status, code] of [
  ["415 non-JSON", "{}", { "Content-Type": "text/plain" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
  ["400 malformed JSON", "{\"capability\":", {}, 400, "INVALID_REQUEST"],
  ["400 input outside schema", JSON.stringify({ capability: "route-optimizer.solve", input: { points: [[1, 2]] } }), {}, 400, "INVALID_REQUEST"],
  ["404 unknown capability", JSON.stringify({ capability: "nope.run", input: {} }), {}, 404, "NOT_FOUND"],
  ["422 browser capability", JSON.stringify({ capability: "neural-network.train", input: {} }), {}, 422, "SEMANTIC_REJECTION"],
  ["413 body over 64 KiB", JSON.stringify({ capability: "route-optimizer.solve", input: { pad: "x".repeat(70000) } }), {}, 413, "PAYLOAD_TOO_LARGE"],
]) {
  await check(`POST runs · ${name}`, async () => {
    const result = await post(body, headers);
    expect(result.response.status === status && result.body?.code === code, `got ${result.response.status} ${result.body?.code}`);
    return `${status} ${code}`;
  });
}

for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name.padEnd(52)} ${String(result.ms).padStart(5)} ms  ${result.detail}`);
const failed = results.filter((result) => !result.ok).length;
console.log(failed ? `\n${failed} check(s) failed against ${base}` : `\nAll ${results.length} checks passed against ${base}`);
process.exit(failed ? 1 : 0);
