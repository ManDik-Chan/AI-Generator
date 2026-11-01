const MAX_BYTES = 16 * 1024;
const MAX_REPORTS = 8;
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 60;
const BODY_TIMEOUT_MS = 2_000;
const directives = new Set([
  "default-src", "script-src", "script-src-elem", "script-src-attr", "style-src", "style-src-elem", "style-src-attr",
  "img-src", "font-src", "connect-src", "worker-src", "media-src", "object-src", "frame-src", "base-uri", "form-action", "frame-ancestors",
]);
type Summary = { directive: string; disposition: "report"; blocked: "inline" | "eval" | "self" | "external-http" | "external-https" | "other" };
type ReporterOptions = { now?: () => number; log?: (summary: Summary) => void };
const record = (value: unknown): Record<string, unknown> | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

function summarize(value: unknown, requestOrigin: string): Summary | undefined {
  const body = record(value);
  if (!body) return;
  const directive = body["effective-directive"] ?? body.effectiveDirective;
  if (typeof directive !== "string" || !directives.has(directive) || body.disposition !== "report") return;
  const uri = body["blocked-uri"] ?? body.blockedURL;
  let blocked: Summary["blocked"] = "other";
  if (uri === "inline" || uri === "eval") blocked = uri;
  else if (typeof uri === "string") {
    try {
      const url = new URL(uri);
      if (url.origin === requestOrigin) blocked = "self";
      else if (url.protocol === "http:") blocked = "external-http";
      else if (url.protocol === "https:") blocked = "external-https";
    } catch { /* Never retain a URL, document location, source sample, or body. */ }
  }
  return { directive, disposition: "report", blocked };
}

async function readBoundedBody(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new RangeError("size");
  if (!request.body) throw new SyntaxError("empty");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), BODY_TIMEOUT_MS); });
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new RangeError("size");
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } finally {
    clearTimeout(timer);
    // Cancellation is best effort: a malicious underlying stream may never settle.
    void reader.cancel().catch(() => undefined);
  }
}

/** Fixed-size, per-process guard; best-effort telemetry, not a distributed security control. */
export function createCspReportHandler({ now = Date.now, log = (summary) => console.info("[csp-report]", summary) }: ReporterOptions = {}) {
  let windowStart = 0;
  let requests = 0;
  return async function POST(request: Request) {
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const reply = (status: number, extra?: Record<string, string>) => new Response(null, { status, headers: { ...headers, ...extra } });
    const timestamp = now();
    if (timestamp - windowStart >= WINDOW_MS || timestamp < windowStart) { windowStart = timestamp; requests = 0; }
    // Quietly discard over budget: legitimate inline-report bursts must not
    // create HTTP errors in the application's browser diagnostics.
    if (++requests > REQUESTS_PER_WINDOW) return reply(204);
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!["application/csp-report", "application/reports+json"].includes(contentType ?? "")) return reply(415);
    try {
      const payload = await readBoundedBody(request);
      let bodies: unknown[];
      if (contentType === "application/reports+json") {
        if (!Array.isArray(payload)) return reply(400);
        if (payload.length > MAX_REPORTS) return reply(413);
        bodies = payload.map(record).filter((report) => report?.type === "csp-violation").map((report) => report?.body);
      } else {
        bodies = [record(payload)?.["csp-report"]];
      }
      const summaries = bodies.map((body) => summarize(body, new URL(request.url).origin)).filter((summary) => summary !== undefined);
      if (!summaries.length) return reply(400);
      // Each log field comes from a fixed vocabulary. Reports are untrusted claims;
      // never log document/source/blocked URLs, samples, IPs, cookies or request bodies.
      for (const summary of summaries) log(summary);
      return reply(204);
    } catch (error) {
      return reply(error instanceof RangeError ? 413 : 400);
    }
  };
}
