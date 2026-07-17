import "server-only";

export interface BrainstormRunDeadline {
  signal: AbortSignal;
  didTimeout(): boolean;
  dispose(): void;
}

/**
 * Combines durable explicit cancellation with a hard run budget. The timeout
 * flag deliberately remains separate so callers never report a deadline as a
 * user cancellation.
 */
export function createBrainstormRunDeadline(
  cancellationSignal: AbortSignal,
  timeoutMs: number,
): BrainstormRunDeadline {
  const controller = new AbortController();
  let timedOut = false;

  const abortForCancellation = () => {
    if (!controller.signal.aborted) {
      controller.abort(
        cancellationSignal.reason
        ?? new DOMException("Generation was explicitly cancelled", "AbortError"),
      );
    }
  };

  if (cancellationSignal.aborted) abortForCancellation();
  else cancellationSignal.addEventListener("abort", abortForCancellation, { once: true });

  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort(new DOMException("Brainstorm run deadline exceeded", "TimeoutError"));
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
