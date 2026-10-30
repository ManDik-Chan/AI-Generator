// Stream a run as Server-Sent Events: every lifecycle transition plus live progress.
// Usage: node examples/demo-api/stream.mjs [baseUrl]   (default http://localhost:3000)

export async function streamRun(baseUrl, { onStatus = () => {}, onProgress = () => {}, signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${baseUrl}/api/demo/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      capability: "route-optimizer.solve",
      input: { instance: { kind: "uniform", count: 300, seed: 3 }, improvement: "annealing", annealingIterations: 400000 },
    }),
    signal,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`HTTP ${response.status} ${error.code}: ${error.message}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last = null;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === "run.status") {
        last = payload;
        onStatus(payload);
      } else if (event === "run.progress") {
        onProgress(payload.data);
      }
    }
    if (done) break;
  }
  return last; // the terminal Run
}

if (process.argv[1]?.endsWith("stream.mjs")) {
  const run = await streamRun(process.argv[2] ?? "http://localhost:3000", {
    onStatus: (r) => console.log(`status   ${r.status}`),
    onProgress: (p) => console.log(`progress ${p.phase.padEnd(9)} ${p.elapsedMs} ms  length ${p.length}`),
  });
  console.log(`final    ${run.status}, length ${run.output?.length}`);
}
