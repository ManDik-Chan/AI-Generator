/*
 * In-memory limits for the public demo API.
 *
 * Scope: one function instance. Vercel may run several instances, so these limits are a
 * best-effort first line, not a global quota; the hard bounds are the input schema, the
 * per-run deadline and the function's maxDuration. A shared store (e.g. Vercel Firewall
 * rules or a KV counter) is listed as a follow-up in docs/developer/interface-status.md.
 */

export interface LimitDecision {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a slot frees up. */
  resetSeconds: number;
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxKeys = 5000,
  ) {}

  take(key: string, now: number): LimitDecision {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, limit: this.limit, remaining: 0, resetSeconds: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    // Re-insert so the Map's order tracks recency; evict the stalest keys beyond the cap.
    this.hits.delete(key);
    this.hits.set(key, recent);
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return { ok: true, limit: this.limit, remaining: this.limit - recent.length, resetSeconds: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
  }

  size() {
    return this.hits.size;
  }
}

export class ConcurrencyGate {
  private total = 0;
  private readonly perKey = new Map<string, number>();

  constructor(
    readonly maxTotal: number,
    readonly maxPerKey: number,
  ) {}

  /** Returns a release function, or null when the client or the instance is at capacity. */
  acquire(key: string): (() => void) | null {
    const current = this.perKey.get(key) ?? 0;
    if (this.total >= this.maxTotal || current >= this.maxPerKey) return null;
    this.total += 1;
    this.perKey.set(key, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total -= 1;
      const left = (this.perKey.get(key) ?? 1) - 1;
      if (left <= 0) this.perKey.delete(key);
      else this.perKey.set(key, left);
    };
  }

  active() {
    return this.total;
  }
}

export function rateLimitHeaders(decision: LimitDecision): Record<string, string> {
  return {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(decision.resetSeconds),
  };
}
