// Run route-optimizer.solve on the Demo Runtime API and print a summary.
// Usage: node examples/demo-api/solve.mjs [baseUrl]   (default http://localhost:3000)

export async function solve(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl}/api/demo/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      capability: "route-optimizer.solve",
      input: { instance: { kind: "clustered", count: 120, seed: 7 }, improvement: "or-opt", deadlineMs: 2000 },
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    // No run was executed. Every error has a stable code and a requestId.
    throw new Error(`HTTP ${response.status} ${body.code}: ${body.message} (requestId ${body.requestId})`);
  }
  // The run executed: HTTP is 200 whatever the outcome, so check its status.
  if (body.status !== "SUCCEEDED" && body.status !== "TIMED_OUT") {
    throw new Error(`run ${body.id} ended ${body.status}: ${body.error?.message}`);
  }
  return body;
}

if (process.argv[1]?.endsWith("solve.mjs")) {
  const run = await solve(process.argv[2] ?? "http://localhost:3000");
  const { length, lowerBound, gap, stopReason } = run.output;
  console.log(`${run.status} in ${run.durationMs} ms: length ${length}, lower bound ${lowerBound}, gap ≤ ${(gap * 100).toFixed(1)}%, ${stopReason}`);
}
