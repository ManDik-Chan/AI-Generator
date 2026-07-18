import "server-only";

export type AgentWorkerCapability =
  | "REASONING"
  | "WEB_SEARCH"
  | "FILE_READ"
  | "FILE_WRITE"
  | "CODE_EXECUTION"
  | "GIT_READ"
  | "GIT_WRITE"
  | "BROWSER"
  | "MCP";

export interface AgentWorkerToolPolicy {
  allowedCapabilities: readonly AgentWorkerCapability[];
  allowedTools: readonly string[];
}

export const AGENT_WORKER_TOOL_POLICY = Object.freeze({
  allowedCapabilities: Object.freeze(["REASONING"] as const),
  allowedTools: Object.freeze([] as const),
}) satisfies AgentWorkerToolPolicy;

export class AgentToolPolicyError extends Error {
  readonly code = "TOOL_NOT_ALLOWED";

  constructor() {
    super("Agent Worker capability or tool is not allowed in Phase 7A1.1.");
    this.name = "AgentToolPolicyError";
  }
}

export function assertAgentWorkerCapability(capability: AgentWorkerCapability) {
  if (!AGENT_WORKER_TOOL_POLICY.allowedCapabilities.includes(capability as "REASONING")) {
    throw new AgentToolPolicyError();
  }
}

export function assertAgentWorkerTool(toolName: string) {
  if (!AGENT_WORKER_TOOL_POLICY.allowedTools.includes(toolName as never)) {
    throw new AgentToolPolicyError();
  }
}

export function getAgentWorkerToolPolicy(): AgentWorkerToolPolicy {
  return AGENT_WORKER_TOOL_POLICY;
}
