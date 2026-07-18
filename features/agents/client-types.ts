export type AgentModeView = "STANDARD" | "DEEP";
export type AgentRunStatusView = "PENDING" | "COMPLETE" | "ERROR" | "CANCELLED";
export type AgentRunPhaseView = "PLANNING" | "DISPATCHING" | "WORKING" | "SYNTHESIZING" | "FINISHED";
export type AgentWorkerStatusView = "QUEUED" | "BLOCKED" | "RUNNING" | "COMPLETE" | "ERROR" | "CANCELLED" | "TIMEOUT";

export interface AgentWorkerView {
  key: string;
  position: number;
  name: string;
  title: string;
  objective: string;
  expectedDeliverable: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: AgentWorkerStatusView;
  dependsOnKeys: string[];
  workSummary: string | null;
  findings: string[];
  assumptions: string[];
  risks: string[];
  recommendations: string[];
  finalDeliverable: string | null;
  structured: boolean;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEventView {
  sequence: number;
  type: string;
  workerKey: string | null;
  summaryText: string | null;
  createdAt: string;
}

export interface AgentRunView {
  id: string;
  conversationId: string;
  conversationTitle?: string;
  userMessageId: string;
  userProblem?: string;
  assistantMessageId: string;
  mode: AgentModeView;
  status: AgentRunStatusView;
  phase: AgentRunPhaseView;
  planOverview: string | null;
  planFallback: boolean;
  plannedWorkerCount: number;
  completedWorkerCount: number;
  successfulWorkerCount: number;
  providerCallCount: number;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assistantMessage: { content: string; status: AgentRunStatusView | "PENDING"; createdAt: string };
  workers: AgentWorkerView[];
  events: AgentEventView[];
  usage?: { limit: number; used: number; remaining: number; unlimited: boolean };
}

export interface AgentRunListItem {
  id: string;
  conversationId: string;
  userProblem: string;
  mode: AgentModeView;
  status: AgentRunStatusView;
  phase: AgentRunPhaseView;
  plannedWorkerCount: number;
  successfulWorkerCount: number;
  providerCallCount: number;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
}

export type AgentStreamEvent = { event: string; data: Record<string, unknown> };
