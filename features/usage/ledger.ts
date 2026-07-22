import { Prisma, type AgentRunMode, type ToolType, type UsageCapability } from "@prisma/client";

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

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

export class InvalidUsageIdempotencyKeyError extends Error {
  constructor() {
    super("Idempotency-Key must be 8-160 characters using letters, numbers, dot, underscore, colon, or hyphen.");
    this.name = "InvalidUsageIdempotencyKeyError";
  }
}

export function readUsageIdempotencyKey(request: Request) {
  const header = request.headers.get("idempotency-key");
  if (header === null) return undefined;
  const key = header.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw new InvalidUsageIdempotencyKeyError();
  return key;
}

export function usageIdempotencyKey(capability: UsageCapability, runId: string, requestKey?: string) {
  return requestKey ? `request:${requestKey}` : `${capability.toLowerCase()}:${runId}`;
}

export function isUsageIdempotencyConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(",")
    : String(error.meta?.target ?? "");
  return target.includes("idempotency") || target.includes("usage_ledger_user_id_idempotency_key");
}

export function usageUnits(aggregate: { _sum: { units: number | null } }) {
  return aggregate._sum.units ?? 0;
}
