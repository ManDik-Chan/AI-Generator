/*
 * Web Worker entry for `neural-network.train`. Training runs here, off the page's main
 * thread; the page talks to it only through `aig.worker/1` messages.
 */
import { createTrainer } from "@/features/demos/neural-network/trainer";

interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

const scope = self as unknown as WorkerScope;

const trainer = createTrainer({
  post: (message) => scope.postMessage(message),
  schedule: (task) => {
    const id = setTimeout(task, 0);
    return () => clearTimeout(id);
  },
  now: () => performance.now(),
  sliceMs: 16,
});

scope.onmessage = (event) => trainer.handle(event.data);
