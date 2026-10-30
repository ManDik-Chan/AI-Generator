/*
 * Project run lifecycle from the platform roadmap:
 * PENDING → ACCEPTED → RUNNING → { SUCCEEDED, FAILED, CANCELLED, TIMED_OUT }.
 * Terminal states are final and idempotent; cancellation is allowed before completion.
 * The demo run simulator in the project console walks this machine locally.
 */
import type { RunStatus } from "@/features/platform/types";

const transitions: Record<RunStatus, readonly RunStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED", "FAILED"],
  ACCEPTED: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  TIMED_OUT: [],
};

export const runPath: readonly RunStatus[] = ["PENDING", "ACCEPTED", "RUNNING", "SUCCEEDED"];
export const terminalRunStates: readonly RunStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"];

export function isTerminal(status: RunStatus) {
  return transitions[status].length === 0;
}

export function canTransition(from: RunStatus, to: RunStatus) {
  return transitions[from].includes(to);
}

/** Apply a transition; an illegal or repeated transition leaves the status unchanged. */
export function advanceRun(from: RunStatus, to: RunStatus): RunStatus {
  return canTransition(from, to) ? to : from;
}
