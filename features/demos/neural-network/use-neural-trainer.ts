"use client";

/*
 * React binding for the neural-network capability. Prefers a Web Worker; if the browser
 * cannot start one (or the worker crashes) it falls back to running the same trainer on
 * the main thread and says so in the UI.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";

import { initialTrainerState, trainerReducer, type Transport } from "@/features/demos/neural-network/host-state";
import { outboundMessageSchema, WORKER_PROTOCOL, type InboundMessage, type SessionConfig, type TrainInput } from "@/features/demos/neural-network/protocol";
import { createTrainer } from "@/features/demos/neural-network/trainer";

interface Channel {
  send(message: InboundMessage): void;
  dispose(): void;
}

let runCounter = 0;
const nextRunId = () => `run_nn_${Date.now().toString(36)}_${(runCounter += 1)}`;

export function useNeuralTrainer() {
  const [state, dispatch] = useReducer(trainerReducer, initialTrainerState);
  const channel = useRef<Channel | null>(null);
  const lastConfig = useRef<SessionConfig | null>(null);

  useEffect(() => {
    let disposed = false;
    const receive = (data: unknown) => {
      if (disposed) return;
      const parsed = outboundMessageSchema.safeParse(data);
      if (parsed.success) dispatch({ kind: "message", message: parsed.data });
      else dispatch({ kind: "notice", message: "收到一条不符合协议的消息，已忽略。" });
    };
    const adopt = (transport: Transport, next: Channel, note?: string) => {
      channel.current = next;
      dispatch({ kind: "transport", transport, note });
      if (lastConfig.current) next.send({ protocol: WORKER_PROTOCOL, type: "session.configure", config: lastConfig.current });
    };
    const startMainThread = (note: string) => {
      const trainer = createTrainer({
        post: receive,
        schedule: (task) => {
          const id = window.setTimeout(task, 0);
          return () => window.clearTimeout(id);
        },
        now: () => performance.now(),
        sliceMs: 10,
      });
      adopt("main-thread", { send: (message) => trainer.handle(message), dispose: () => trainer.dispose() }, note);
    };

    try {
      if (typeof Worker === "undefined") throw new Error("Worker unavailable");
      const worker = new Worker(new URL("./nn.worker.ts", import.meta.url));
      worker.onmessage = (event) => receive(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        worker.terminate();
        if (!disposed) startMainThread("Web Worker 出错，已改在主线程运行（页面可能稍卡）。");
      };
      worker.onmessageerror = () => dispatch({ kind: "notice", message: "一条消息无法反序列化，已忽略。" });
      adopt("worker", { send: (message) => worker.postMessage(message), dispose: () => worker.terminate() });
    } catch {
      startMainThread("这个浏览器无法启动 Web Worker，已改在主线程运行（页面可能稍卡）。");
    }

    return () => {
      disposed = true;
      channel.current?.dispose();
      channel.current = null;
    };
  }, []);

  const send = useCallback((message: InboundMessage) => {
    const detail = message.type === "run.start" ? ` ${message.runId} epochs=${message.input.epochs} lr=${message.input.learningRate} ${message.input.optimizer}` : message.type === "run.cancel" ? ` ${message.runId}` : message.type === "session.configure" ? ` ${message.config.dataset.kind} hidden=[${message.config.network.hidden.join(",")}]` : ` seed=${message.seed}`;
    dispatch({ kind: "sent", line: `→ ${message.type}${detail}` });
    channel.current?.send(message);
  }, []);

  const configure = useCallback((config: SessionConfig) => {
    lastConfig.current = config;
    send({ protocol: WORKER_PROTOCOL, type: "session.configure", config });
  }, [send]);

  const start = useCallback((input: TrainInput) => {
    const runId = nextRunId();
    dispatch({ kind: "run.requested", runId, at: new Date().toISOString() });
    send({ protocol: WORKER_PROTOCOL, type: "run.start", runId, input });
  }, [send]);

  const cancel = useCallback((runId: string) => {
    send({ protocol: WORKER_PROTOCOL, type: "run.cancel", runId });
  }, [send]);

  const reset = useCallback((seed: number) => {
    send({ protocol: WORKER_PROTOCOL, type: "session.reset", seed });
  }, [send]);

  return { state, configure, start, cancel, reset };
}
