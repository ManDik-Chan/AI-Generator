/*
 * Page-side state for the neural-network demo, as a pure reducer over `aig.worker/1`
 * messages. The page owns the PENDING state (it creates the run id before posting
 * run.start); the worker reports every later transition.
 */
import type { Metrics, OutboundMessage, SessionSnapshot } from "@/features/demos/neural-network/protocol";
import type { RunError } from "@/features/demos/runtime/run";
import { advanceRun, isTerminal } from "@/features/platform/run-lifecycle";
import type { RunStatus } from "@/features/platform/types";

export type Transport = "starting" | "worker" | "main-thread";

export interface HostRun {
  id: string;
  status: RunStatus;
  transitions: { status: RunStatus; at: string }[];
  error: RunError | null;
  fromEpoch: number;
}

export interface HistoryPoint {
  epoch: number;
  trainLoss: number;
  testLoss: number;
}

export interface TrainerState {
  transport: Transport;
  transportNote: string | null;
  session: SessionSnapshot | null;
  grid: number[] | null;
  weights: number[][] | null;
  metrics: Metrics | null;
  history: HistoryPoint[];
  run: HostRun | null;
  notice: string | null;
  /** Protocol messages in both directions (progress messages are only counted). */
  log: string[];
  progressCount: number;
}

export type TrainerAction =
  | { kind: "message"; message: OutboundMessage }
  | { kind: "transport"; transport: Transport; note?: string }
  | { kind: "run.requested"; runId: string; at: string }
  | { kind: "notice"; message: string | null }
  | { kind: "sent"; line: string };

export const MAX_HISTORY = 300;

export const initialTrainerState: TrainerState = {
  transport: "starting",
  transportNote: null,
  session: null,
  grid: null,
  weights: null,
  metrics: null,
  history: [],
  run: null,
  notice: null,
  log: [],
  progressCount: 0,
};

export const MAX_LOG = 60;
const pushLog = (log: string[], line: string) => (log.length >= MAX_LOG ? [...log.slice(1 - MAX_LOG), line] : [...log, line]);

function describe(message: OutboundMessage) {
  switch (message.type) {
    case "session.ready":
      return `← session.ready  layers=${message.session.sizes.join("-")} params=${message.session.parameterCount}`;
    case "run.status":
      return `← run.status  ${message.runId} ${message.status}${message.error ? ` ${message.error.code}` : ""} epoch=${message.epoch}`;
    case "protocol.error":
      return `← protocol.error  ${message.code}`;
    default:
      return `← ${message.type}`;
  }
}

/** Append a point; when full, halve the resolution so the curve keeps its whole shape. */
export function appendHistory(history: HistoryPoint[], point: HistoryPoint): HistoryPoint[] {
  const last = history[history.length - 1];
  if (last && point.epoch <= last.epoch) return history;
  const next = [...history, point];
  return next.length > MAX_HISTORY ? next.filter((_, index) => index % 2 === 0 || index === next.length - 1) : next;
}

export function isRunActive(run: HostRun | null) {
  return Boolean(run && !isTerminal(run.status));
}

export function trainerReducer(state: TrainerState, action: TrainerAction): TrainerState {
  if (action.kind === "transport") {
    const run = state.run && !isTerminal(state.run.status) && action.transport === "main-thread"
      ? { ...state.run, status: "FAILED" as const, error: { code: "CAPABILITY_ERROR" as const, message: "Worker 意外退出，运行中断。" }, transitions: [...state.run.transitions, { status: "FAILED" as const, at: new Date().toISOString() }] }
      : state.run;
    return { ...state, transport: action.transport, transportNote: action.note ?? null, run };
  }
  if (action.kind === "notice") return { ...state, notice: action.message };
  if (action.kind === "sent") return { ...state, log: pushLog(state.log, action.line) };
  if (action.kind === "run.requested") {
    const epoch = state.metrics?.epoch ?? 0;
    return { ...state, notice: null, run: { id: action.runId, status: "PENDING", transitions: [{ status: "PENDING", at: action.at }], error: null, fromEpoch: epoch } };
  }

  const message = action.message;
  if (message.type === "run.progress") state = { ...state, progressCount: state.progressCount + 1 };
  else state = { ...state, log: pushLog(state.log, describe(message)) };
  switch (message.type) {
    case "session.ready": {
      const { session } = message;
      return {
        ...state,
        session,
        grid: session.grid,
        weights: session.weights,
        metrics: session.metrics,
        history: [{ epoch: session.metrics.epoch, trainLoss: session.metrics.trainLoss, testLoss: session.metrics.testLoss }],
      };
    }
    case "run.status": {
      if (!state.run || state.run.id !== message.runId) return state;
      const next = advanceRun(state.run.status, message.status);
      if (next === state.run.status) return state;
      return {
        ...state,
        run: { ...state.run, status: next, error: message.error ?? state.run.error, transitions: [...state.run.transitions, { status: next, at: message.at }] },
      };
    }
    case "run.progress": {
      if (state.run && state.run.id !== message.runId) return state;
      const { metrics } = message;
      return {
        ...state,
        metrics,
        grid: message.grid ?? state.grid,
        weights: message.weights ?? state.weights,
        history: appendHistory(state.history, { epoch: metrics.epoch, trainLoss: metrics.trainLoss, testLoss: metrics.testLoss }),
      };
    }
    case "protocol.error":
      return { ...state, notice: message.message };
  }
}
