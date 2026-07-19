import type { AgentRunMode } from "@prisma/client";

export const AGENT_INPUT_MAX_CHARS = 8_000;
export const AGENT_PLAN_OVERVIEW_MAX_CHARS = 2_000;
export const AGENT_PLAN_KEY_MAX_CHARS = 64;
export const AGENT_PLAN_NAME_MAX_CHARS = 80;
export const AGENT_PLAN_TITLE_MAX_CHARS = 160;
export const AGENT_PLAN_ASSIGNMENT_MAX_CHARS = 1_200;
export const AGENT_EVENT_LIMIT = 96;

export const AGENT_MODE_LIMITS = {
  STANDARD: {
    workerCount: 4,
    maxConcurrency: 4,
    maxProviderCalls: 6,
    creditCost: 1,
    maxDependencyDepth: 3,
  },
  DEEP: {
    workerCount: 6,
    maxConcurrency: 6,
    maxProviderCalls: 8,
    creditCost: 2,
    maxDependencyDepth: 4,
  },
} as const satisfies Record<AgentRunMode, {
  workerCount: number;
  maxConcurrency: number;
  maxProviderCalls: number;
  creditCost: number;
  maxDependencyDepth: number;
}>;

export function getAgentModeLimits(mode: AgentRunMode) {
  return AGENT_MODE_LIMITS[mode];
}
