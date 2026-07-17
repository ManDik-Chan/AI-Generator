const encoder = new TextEncoder();

export type SseEncoder = (event: string, data: unknown) => string;

/** Optional transport observer. It never owns or aborts the generation job. */
export class SseObserver {
  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private detached = false;
  private readonly buffered: Uint8Array[] = [];

  constructor(private readonly encode: SseEncoder) {}

  send(event: string, data: unknown) {
    if (this.detached) return false;
    const value = encoder.encode(this.encode(event, data));
    if (!this.controller) {
      if (this.buffered.length < 32) this.buffered.push(value);
      return true;
    }
    try {
      this.controller.enqueue(value);
      return true;
    } catch {
      this.detach();
      return false;
    }
  }

  attach(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (this.detached) return;
    this.controller = controller;
    try {
      for (const value of this.buffered.splice(0)) controller.enqueue(value);
    } catch {
      this.detach();
    }
  }

  detach() {
    this.detached = true;
    this.controller = undefined;
    this.buffered.length = 0;
  }

  close() {
    if (this.detached) return;
    try { this.controller?.close(); } catch { /* transport already closed */ }
    this.detach();
  }
}

export function createObservedSseResponse(observer: SseObserver, task: Promise<unknown>, requestSignal?: AbortSignal) {
  const detach = () => observer.detach();
  requestSignal?.addEventListener("abort", detach, { once: true });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      observer.attach(controller);
      void task.finally(() => {
        requestSignal?.removeEventListener("abort", detach);
        observer.close();
      });
    },
    cancel() { observer.detach(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
