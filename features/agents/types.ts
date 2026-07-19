import type { AgentPriority, AgentRunMode } from "@prisma/client";

export interface AgentPlanWorker {
  key: string;
  name: string;
  title: string;
  objective: string;
  expectedDeliverable: string;
  priority: AgentPriority;
  dependsOn: string[];
}

export interface AgentPlan {
  overview: string;
  workers: AgentPlanWorker[];
}

export interface AgentPlanningContext {
  userProblem: string;
  mode: AgentRunMode;
  conversationSummary?: string;
  personaSummary?: string;
  memorySummary?: string;
}
