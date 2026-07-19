import "server-only";

import { persistAgentPlan } from "@/features/agents/creation";
import { reservePlannerProviderCall } from "@/features/agents/events";
import { createAgentPlanWithFallback } from "@/features/agents/planner";
import type { AgentPlanningContext } from "@/features/agents/types";
import type { AgentGenerationConfig, AiProvider } from "@/lib/ai/types";

export async function runAgentPlanningPhase(input: {
  userId: string;
  runId: string;
  context: AgentPlanningContext;
  provider: AiProvider;
  config: AgentGenerationConfig;
  signal?: AbortSignal;
}) {
  if (!await reservePlannerProviderCall(input.userId, input.runId)) {
    throw new Error("Planner Provider call could not be reserved.");
  }
  const result = await createAgentPlanWithFallback({
    provider: input.provider,
    config: input.config,
    context: input.context,
    signal: input.signal,
  });
  const persisted = await persistAgentPlan({
    userId: input.userId,
    runId: input.runId,
    plan: result.plan,
    fallback: result.fallback,
    fallbackErrorCode: result.errorCode,
  });
  if (!persisted) throw new Error("Agent plan could not be persisted.");
  return result;
}
