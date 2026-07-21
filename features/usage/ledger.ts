import type { AgentRunMode, ToolType, UsageCapability } from "@prisma/client";

export const TEXT_TOOL_USAGE_CAPABILITIES = [
  "TOOL_SUMMARIZE",
  "TOOL_REWRITE",
  "TOOL_TRANSLATE",
] as const satisfies readonly UsageCapability[];

export const AGENT_USAGE_CAPABILITIES = [
  "AGENT_STANDARD",
  "AGENT_DEEP",
] as const satisfies readonly UsageCapability[];

export function toolUsageCapability(tool: ToolType): UsageCapability {
  switch (tool) {
    case "SUMMARIZE": return "TOOL_SUMMARIZE";
    case "REWRITE": return "TOOL_REWRITE";
    case "TRANSLATE": return "TOOL_TRANSLATE";
    case "IMAGE_ANALYZE": return "IMAGE_ANALYZE";
    case "IMAGE_GENERATE": return "IMAGE_GENERATE";
    case "BRAINSTORM": return "BRAINSTORM";
  }
}

export function agentUsageCapability(mode: AgentRunMode): UsageCapability {
  return mode === "DEEP" ? "AGENT_DEEP" : "AGENT_STANDARD";
}

export function usageIdempotencyKey(capability: UsageCapability, runId: string) {
  return `${capability.toLowerCase()}:${runId}`;
}

export function usageUnits(aggregate: { _sum: { units: number | null } }) {
  return aggregate._sum.units ?? 0;
}
