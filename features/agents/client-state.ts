import type { AgentModeView, AgentRunView, AgentStreamEvent, AgentWorkerStatusView, AgentWorkerView } from "@/features/agents/client-types";

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

export function createPendingAgentRunView(data: Record<string, unknown>): AgentRunView {
  const mode: AgentModeView = data.mode === "DEEP" ? "DEEP" : "STANDARD";
  const startedAt = text(data.startedAt, new Date().toISOString());
  return {
    id: text(data.runId),
    conversationId: text(data.conversationId),
    userMessageId: text(data.userMessageId),
    assistantMessageId: text(data.assistantMessageId),
    mode,
    status: "PENDING",
    phase: "PLANNING",
    planOverview: null,
    planFallback: false,
    plannedWorkerCount: mode === "DEEP" ? 6 : 4,
    completedWorkerCount: 0,
    successfulWorkerCount: 0,
    providerCallCount: 0,
    errorCode: null,
    startedAt,
    completedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    assistantMessage: { content: "", status: "PENDING", createdAt: startedAt },
    workers: [],
    events: [],
    usage: typeof data.usage === "object" ? data.usage as AgentRunView["usage"] : undefined,
  };
}

function workerFromPlan(value: unknown, position: number, now: string): AgentWorkerView | null {
  if (!value || typeof value !== "object") return null;
  const worker = value as Record<string, unknown>;
  const key = text(worker.key);
  if (!key) return null;
  return {
    key,
    position,
    name: text(worker.name, key),
    title: text(worker.title, key),
    objective: text(worker.objective),
    expectedDeliverable: text(worker.expectedDeliverable),
    priority: worker.priority === "HIGH" || worker.priority === "LOW" ? worker.priority : "MEDIUM",
    status: "QUEUED",
    dependsOnKeys: stringArray(worker.dependsOn),
    workSummary: null,
    findings: [], assumptions: [], risks: [], recommendations: [], finalDeliverable: null,
    structured: false, errorCode: null, startedAt: null, completedAt: null, createdAt: now, updatedAt: now,
  };
}

function updateWorker(run: AgentRunView, workerKey: string, update: Partial<AgentWorkerView>) {
  const workers = run.workers.map((worker) => worker.key === workerKey ? { ...worker, ...update } : worker);
  return {
    ...run,
    workers,
    completedWorkerCount: workers.filter((worker) => ["BLOCKED", "COMPLETE", "ERROR", "CANCELLED", "TIMEOUT"].includes(worker.status)).length,
    successfulWorkerCount: workers.filter((worker) => worker.status === "COMPLETE").length,
  };
}

export function reduceAgentStreamEvent(current: AgentRunView, streamEvent: AgentStreamEvent): AgentRunView {
  const now = new Date().toISOString();
  const data = streamEvent.data;
  if (streamEvent.event === "plan_ready" || streamEvent.event === "plan_fallback") {
    const workers = Array.isArray(data.workers) ? data.workers.map((worker, index) => workerFromPlan(worker, index, now)).filter((worker): worker is AgentWorkerView => Boolean(worker)) : [];
    return { ...current, phase: "DISPATCHING", planOverview: text(data.overview), planFallback: streamEvent.event === "plan_fallback", providerCallCount: Math.max(1, current.providerCallCount), workers, updatedAt: now };
  }
  const workerKey = text(data.workerKey);
  if (streamEvent.event === "worker_started" && workerKey) {
    return updateWorker({ ...current, phase: "WORKING", providerCallCount: current.providerCallCount + 1, updatedAt: now }, workerKey, { status: "RUNNING", startedAt: now, updatedAt: now });
  }
  if (streamEvent.event === "worker_done" && workerKey) {
    const deliverable = data.deliverable && typeof data.deliverable === "object" ? data.deliverable as Record<string, unknown> : {};
    return updateWorker(current, workerKey, {
      status: "COMPLETE", completedAt: now, updatedAt: now, workSummary: text(deliverable.workSummary) || null,
      findings: stringArray(deliverable.findings), assumptions: stringArray(deliverable.assumptions), risks: stringArray(deliverable.risks),
      recommendations: stringArray(deliverable.recommendations), finalDeliverable: text(deliverable.finalDeliverable) || null,
      structured: deliverable.structured === true,
    });
  }
  const terminalEvents: Record<string, AgentWorkerStatusView> = { worker_blocked: "BLOCKED", worker_error: "ERROR", worker_cancelled: "CANCELLED", worker_timeout: "TIMEOUT" };
  if (workerKey && terminalEvents[streamEvent.event]) return updateWorker(current, workerKey, { status: terminalEvents[streamEvent.event], errorCode: text(data.code) || null, completedAt: now, updatedAt: now });
  if (streamEvent.event === "synthesis_started") return { ...current, phase: "SYNTHESIZING", providerCallCount: current.providerCallCount + 1, updatedAt: now };
  if (streamEvent.event === "synthesis_delta") return { ...current, assistantMessage: { ...current.assistantMessage, content: current.assistantMessage.content + text(data.text) }, updatedAt: now };
  if (streamEvent.event === "done") return { ...current, status: "COMPLETE", phase: "FINISHED", completedAt: now, updatedAt: now, assistantMessage: { ...current.assistantMessage, status: "COMPLETE" } };
  if (streamEvent.event === "cancelled") return { ...current, status: "CANCELLED", phase: "FINISHED", completedAt: now, updatedAt: now, errorCode: "CANCELLED", assistantMessage: { ...current.assistantMessage, status: "CANCELLED" } };
  if (streamEvent.event === "error") return { ...current, status: "ERROR", phase: "FINISHED", completedAt: now, updatedAt: now, errorCode: text(data.code, "AGENT_ERROR"), assistantMessage: { ...current.assistantMessage, status: "ERROR" } };
  return current;
}
