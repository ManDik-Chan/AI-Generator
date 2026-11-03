/*
 * Client for the two P1-C2 internal Registry writes: POST /projects and PUT /projects/:id/draft.
 *
 * - Same token rules as the read client: Bearer only, `credentials: "omit"`, the token is fetched per
 *   request and never stored, logged, placed in a URL or copied into a result.
 * - The caller owns the attempt (key, exact body text, If-Match). Retrying an uncertain attempt sends
 *   the identical bytes with the identical key, as the contract requires.
 * - The browser adds the Origin header itself for same-origin POST/PUT; the server compares it with
 *   its own origin. Nothing here sets Origin (it is a forbidden header in browsers).
 * - Outcomes are three-way. `ok` is a contract-valid success. `rejected` is a definite refusal: the
 *   server answered with a known error code, or the client refused to send. `unknown` covers every case
 *   where the write may or may not have been applied: no response, timeout, 503, or a response that
 *   does not match the contract. The UI never shows `unknown` as success.
 */
import {
  IDEMPOTENCY_KEY_PATTERN, MAX_WRITE_BYTES, SLUG_PATTERN, WRITE_ERROR_STATUS, createProjectResponseSchema, editDraftResponseSchema, samePayload,
  writeErrorBodySchema, type CreatedProject, type DraftWriteResult, type WriteError, type WriteOutcome,
} from "@/features/developer-console/registry/write-contract";
import { DRAFT_ETAG, isUuid } from "@/features/developer-console/registry/contract";
import { REGISTRY_READ_BASE } from "@/features/developer-console/registry/client";

const TIMEOUT_MS = 20_000;
const TOKEN = /^[A-Za-z0-9._~-]{1,16384}$/;

export interface WriteAttempt {
  /** One key per logical operation; reused only to retry an uncertain attempt. */
  key: string;
  /** Exact request body, serialized once. */
  body: string;
}

export interface DraftAttempt extends WriteAttempt {
  projectId: string;
  ifMatch: string;
}

export interface RegistryWriteClientOptions {
  fetch: typeof fetch;
  getAccessToken: () => Promise<string | null>;
  basePath?: string;
  now?: () => number;
}

export interface RegistryWriteClient {
  createProject(attempt: WriteAttempt): Promise<WriteOutcome<CreatedProject>>;
  saveDraft(attempt: DraftAttempt): Promise<WriteOutcome<DraftWriteResult>>;
  /** Epoch ms until which writes are refused locally after a 429, or null. */
  blockedUntil(): number | null;
}

/** A fresh idempotency key. crypto.randomUUID is available in secure contexts (HTTPS and localhost). */
export function newIdempotencyKey(prefix: "create" | "draft"): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${random.replaceAll("-", "")}`;
}

const rejected = (error: WriteError): { kind: "rejected"; error: WriteError } => ({ kind: "rejected", error });

export function createRegistryWriteClient({ fetch: send, getAccessToken, basePath = REGISTRY_READ_BASE, now = Date.now }: RegistryWriteClientOptions): RegistryWriteClient {
  let blocked: number | null = null;

  async function token(): Promise<string | null> {
    try {
      const value = await getAccessToken();
      return typeof value === "string" && TOKEN.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  async function write<T>(method: "POST" | "PUT", path: string[], attempt: WriteAttempt, ifMatch: string | null,
    accept: (body: unknown, response: Response) => { data: T; etag: string | null; replayed: boolean } | null): Promise<WriteOutcome<T>> {
    if (blocked !== null && now() < blocked) return rejected({ code: "RATE_LIMITED", status: 0, retryAt: blocked });
    blocked = null;
    if (!IDEMPOTENCY_KEY_PATTERN.test(attempt.key) || new TextEncoder().encode(attempt.body).byteLength > MAX_WRITE_BYTES) {
      return rejected({ code: attempt.key && IDEMPOTENCY_KEY_PATTERN.test(attempt.key) ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT", status: 0 });
    }
    const bearer = await token();
    if (bearer === null) return rejected({ code: "AUTH_REQUIRED", status: 0 });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    let text: string;
    try {
      response = await send(`${basePath}/${path.map(encodeURIComponent).join("/")}`, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "Idempotency-Key": attempt.key,
          ...(ifMatch ? { "If-Match": ifMatch } : {}),
        },
        body: attempt.body,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      text = await response.text();
    } catch {
      return { kind: "unknown", reason: controller.signal.aborted ? "TIMEOUT" : "NETWORK", status: 0 };
    } finally {
      clearTimeout(timer);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }

    if (response.status === 200 || response.status === 201) {
      const accepted = body === undefined ? null : accept(body, response);
      return accepted ? { kind: "ok", ...accepted, status: response.status } : { kind: "unknown", reason: "CONTRACT_MISMATCH", status: response.status };
    }
    const parsed = writeErrorBodySchema.safeParse(body);
    if (!parsed.success || WRITE_ERROR_STATUS[parsed.data.code] !== response.status) {
      // A 5xx or a malformed refusal says nothing reliable about whether the write was applied.
      return { kind: "unknown", reason: response.status >= 500 ? "UNAVAILABLE" : "CONTRACT_MISMATCH", status: response.status };
    }
    const code = parsed.data.code;
    if (code === "UNAVAILABLE") return { kind: "unknown", reason: "UNAVAILABLE", status: response.status };
    if (code === "RATE_LIMITED") {
      const seconds = Number(response.headers.get("retry-after"));
      blocked = now() + (Number.isInteger(seconds) && seconds > 0 && seconds <= 3600 ? seconds : 60) * 1000;
      return rejected({ code, status: response.status, retryAt: blocked });
    }
    return rejected({ code, status: response.status });
  }

  return {
    createProject(attempt) {
      let slug: unknown;
      try { slug = (JSON.parse(attempt.body) as { slug?: unknown }).slug; } catch { slug = undefined; }
      if (typeof slug !== "string" || !SLUG_PATTERN.test(slug) || attempt.body !== JSON.stringify({ slug })) {
        return Promise.resolve(rejected({ code: "INVALID_INPUT", status: 0 }));
      }
      return write("POST", ["projects"], attempt, null, (body, response) => {
        const parsed = createProjectResponseSchema.safeParse(body);
        if (!parsed.success || response.status !== 201 || parsed.data.result.slug !== slug) return null;
        return { data: parsed.data.result, etag: null, replayed: parsed.data.replayed };
      });
    },
    saveDraft(attempt) {
      if (!isUuid(attempt.projectId) || !DRAFT_ETAG.test(attempt.ifMatch)) return Promise.resolve(rejected({ code: "INVALID_INPUT", status: 0 }));
      let sent: unknown;
      try { sent = JSON.parse(attempt.body); } catch { return Promise.resolve(rejected({ code: "INVALID_INPUT", status: 0 })); }
      return write("PUT", ["projects", attempt.projectId, "draft"], attempt, attempt.ifMatch, (body, response) => {
        const parsed = editDraftResponseSchema.safeParse(body);
        if (!parsed.success || response.status !== 200) return null;
        const { result, etag, replayed } = parsed.data;
        const header = response.headers.get("etag");
        const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
        // The draft must be this project's, the ETag header must agree, and the stored payload must be
        // exactly what was sent (a replay binds the same canonical request, so this holds for it too).
        if ((header !== null && header !== etag) || !same(result.projectId, attempt.projectId) || !samePayload(result.payload, sent)) return null;
        return { data: result, etag, replayed };
      });
    },
    blockedUntil: () => (blocked !== null && now() < blocked ? blocked : null),
  };
}
