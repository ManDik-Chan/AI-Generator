// Drive any aig.worker/1 capability from a page: configure a session, start one run,
// resolve with the terminal status and the last metrics. `port` can be a Worker.
import { WORKER_PROTOCOL, type Metrics, type OutboundMessage, type SessionConfig, type TrainInput } from "@/features/demos/neural-network/protocol";

export interface Port {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export function trainOnce(port: Port, config: SessionConfig, input: TrainInput, runId = `run_${Date.now()}`) {
  return new Promise<{ status: string; metrics: Metrics | null; error?: string }>((resolve) => {
    let metrics: Metrics | null = null;
    const listener = ({ data }: { data: unknown }) => {
      const message = data as OutboundMessage;
      if (message.type === "session.ready") {
        port.postMessage({ protocol: WORKER_PROTOCOL, type: "run.start", runId, input });
      } else if (message.type === "run.progress" && message.runId === runId) {
        metrics = message.metrics;
      } else if (message.type === "run.status" && message.runId === runId && ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(message.status)) {
        port.removeEventListener("message", listener);
        resolve({ status: message.status, metrics, error: message.error?.code });
      } else if (message.type === "protocol.error") {
        port.removeEventListener("message", listener);
        resolve({ status: "REJECTED", metrics, error: message.code });
      }
    };
    port.addEventListener("message", listener);
    port.postMessage({ protocol: WORKER_PROTOCOL, type: "session.configure", config });
  });
}

// In a page (bundlers need a relative path inside new URL):
//   const worker = new Worker(new URL("../../features/demos/neural-network/nn.worker.ts", import.meta.url));
//   const result = await trainOnce(worker, config, { epochs: 200, learningRate: 0.03, batchSize: 16, l2: 0, optimizer: "adam" });
