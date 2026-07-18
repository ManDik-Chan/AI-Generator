import "server-only";

export interface AgentRunDeadline {
  signal: AbortSignal;
  didTimeout(): boolean;
  dispose(): void;
}

/** Keeps an explicit durable cancellation distinct from the hard run budget. */
export function createAgentRunDeadline(cancellationSignal: AbortSignal, timeoutMs: number): AgentRunDeadline {
  const controller = new AbortController();
  let timedOut = false;

  const abortForCancellation = () => {
    if (!controller.signal.aborted) {
      controller.abort(cancellationSignal.reason ?? new DOMException("Agent run was cancelled", "AbortError"));
    }
  };

  if (cancellationSignal.aborted) abortForCancellation();
  else cancellationSignal.addEventListener("abort", abortForCancellation, { once: true });

  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort(new DOMException("Agent run deadline exceeded", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose() {
      clearTimeout(timer);
      cancellationSignal.removeEventListener("abort", abortForCancellation);
    },
  };
}
