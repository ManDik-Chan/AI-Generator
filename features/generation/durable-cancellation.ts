import "server-only";

interface DurableCancellationOptions {
  isPending(): Promise<boolean>;
  intervalMs?: number;
  taskType: string;
  taskId: string;
}

export interface DurableCancellationController {
  signal: AbortSignal;
  dispose(): void;
}

/**
 * Polls durable state and converts an explicit database cancellation into an
 * AbortSignal for the provider. Transport state is intentionally not involved.
 */
export async function createDurableCancellationController(
  options: DurableCancellationOptions,
): Promise<DurableCancellationController> {
  const controller = new AbortController();
  const intervalMs = Math.max(250, options.intervalMs ?? 750);
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = async () => {
    if (disposed || controller.signal.aborted) return;
    try {
      if (!await options.isPending()) {
        controller.abort(new DOMException("Generation was explicitly cancelled", "AbortError"));
        return;
      }
    } catch (error) {
      console.warn("durable_cancellation_check_failed", {
        taskType: options.taskType,
        taskId: options.taskId,
        errorCode: error instanceof Error ? error.name.slice(0, 100) : "UNKNOWN",
      });
    }
    if (!disposed && !controller.signal.aborted) timer = setTimeout(() => void check(), intervalMs);
  };

  await check();
  return {
    signal: controller.signal,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
