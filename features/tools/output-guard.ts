const OUTPUT_GUARD_WINDOW = 256;

export class UnsafeToolOutputError extends Error {
  readonly code = "UNSAFE_OUTPUT";
  constructor() { super("Tool output matched an obvious policy leak pattern."); this.name = "UnsafeToolOutputError"; }
}

export function detectObviousToolPolicyLeak(output: string) {
  const patterns = [
    /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{8,}/i,
    /(?:postgres(?:ql)?|mysql):\/\/[^\s/:@]+:[^\s/@]+@/i,
    /(?:以下是|这是)我的完整系统提示词\s*[:：\n]/i,
    /(?:here is|below is) my (?:complete|full) system prompt\s*[:\n]/i,
    /(?:我的|真实)\s*(?:API\s*Key|API\s*密钥)\s*(?:是|为|[:：])\s*[A-Za-z0-9._-]{16,}/i,
  ];
  return patterns.some((pattern) => pattern.test(output));
}

export class ToolOutputGuard {
  private pending = "";

  push(text: string) {
    this.pending += text;
    if (detectObviousToolPolicyLeak(this.pending)) throw new UnsafeToolOutputError();
    if (this.pending.length <= OUTPUT_GUARD_WINDOW) return "";
    const releaseLength = this.pending.length - OUTPUT_GUARD_WINDOW;
    const safe = this.pending.slice(0, releaseLength);
    this.pending = this.pending.slice(releaseLength);
    return safe;
  }

  flush() {
    if (detectObviousToolPolicyLeak(this.pending)) throw new UnsafeToolOutputError();
    const safe = this.pending;
    this.pending = "";
    return safe;
  }
}
