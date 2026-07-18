import "server-only";

import type { AiProvider } from "@/lib/ai/types";
import type { AgentGenerationConfig } from "@/lib/ai/types";
import { ToolOutputGuard } from "@/features/tools/output-guard";
import { buildFallbackAgentPlan } from "@/features/agents/fallback-plan";
import { validateAgentPlan } from "@/features/agents/graph";
import { buildAgentPlannerPrompt } from "@/features/agents/prompts";
import type { AgentPlan, AgentPlanningContext } from "@/features/agents/types";

export interface AgentPlanningResult {
  plan: AgentPlan;
  fallback: boolean;
  errorCode?: "PLAN_PROVIDER_ERROR" | "PLAN_INVALID" | "PLAN_UNSAFE";
}

function parseExactJson(value: string) {
  return JSON.parse(value) as unknown;
}

async function collectGuardedPlannerText(provider: AiProvider, request: Parameters<AiProvider["streamText"]>[0]) {
  const guard = new ToolOutputGuard();
  let output = "";
  for await (const delta of provider.streamText(request)) output += guard.push(delta);
  output += guard.flush();
  return output.trim();
}

export async function createAgentPlanWithFallback(input: {
  provider: AiProvider;
  config: AgentGenerationConfig;
  context: AgentPlanningContext;
  signal?: AbortSignal;
}): Promise<AgentPlanningResult> {
  const prompt = buildAgentPlannerPrompt(input.context);
  try {
    const raw = await collectGuardedPlannerText(input.provider, {
      messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
      model: input.config.plannerModel,
      temperature: input.config.temperature,
      maxOutputTokens: input.config.plannerMaxOutputTokens,
      thinking: "disabled",
      signal: input.signal,
    });
    return { plan: validateAgentPlan(parseExactJson(raw), input.context.mode), fallback: false };
  } catch (error) {
    const errorCode = error instanceof SyntaxError || error instanceof Error && error.name === "AgentPlanValidationError"
      ? "PLAN_INVALID"
      : error instanceof Error && error.name === "UnsafeToolOutputError"
        ? "PLAN_UNSAFE"
        : "PLAN_PROVIDER_ERROR";
    return { plan: buildFallbackAgentPlan(input.context.mode), fallback: true, errorCode };
  }
}
