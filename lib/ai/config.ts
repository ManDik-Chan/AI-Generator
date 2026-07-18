import { AiProviderError } from "@/lib/ai/errors";
import type { AgentGenerationConfig, AiProviderConfig, AiRuntimeLimits, BrainstormGenerationConfig, MemoryGenerationConfig, PersonaGenerationConfig, ToolGenerationConfig } from "@/lib/ai/types";

type Environment = Record<string, string | undefined>;

const DEFAULTS = {
  temperature: 0.7,
  maxOutputTokens: 4096,
  dailyMessageLimit: 50,
  maxInputChars: 8000,
  requestTimeoutMs: 120_000,
} as const;

function numberFromEnvironment(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function getPersonaGenerationConfig(env: Environment = process.env): PersonaGenerationConfig {
  const base = requireAiProviderConfig(env);
  return {
    model: env.AI_PERSONA_MODEL?.trim() || base.model,
    temperature: numberFromEnvironment(env.AI_PERSONA_TEMPERATURE, 0.8, 0, 2),
    maxOutputTokens: numberFromEnvironment(env.AI_PERSONA_MAX_OUTPUT_TOKENS, 1800, 200, 8000),
    requestTimeoutMs: numberFromEnvironment(env.AI_PERSONA_REQUEST_TIMEOUT_MS, 90_000, 1_000, 300_000),
  };
}

export function getMemoryGenerationConfig(env: Environment = process.env): MemoryGenerationConfig {
  const base = requireAiProviderConfig(env);
  return {
    model: env.AI_MEMORY_MODEL?.trim() || base.model,
    temperature: numberFromEnvironment(env.AI_MEMORY_TEMPERATURE, 0.1, 0, 1),
    maxOutputTokens: numberFromEnvironment(env.AI_MEMORY_MAX_OUTPUT_TOKENS, 1000, 100, 4000),
    requestTimeoutMs: numberFromEnvironment(env.AI_MEMORY_REQUEST_TIMEOUT_MS, 90_000, 1_000, 180_000),
  };
}

export function getToolGenerationConfig(env: Environment = process.env): ToolGenerationConfig {
  const base = requireAiProviderConfig(env);
  return {
    model: env.AI_TOOL_MODEL?.trim() || base.model,
    temperature: numberFromEnvironment(env.AI_TOOL_TEMPERATURE, 0.3, 0, 2),
    maxOutputTokens: numberFromEnvironment(env.AI_TOOL_MAX_OUTPUT_TOKENS, 4096, 1, 40_000),
    requestTimeoutMs: numberFromEnvironment(env.AI_TOOL_REQUEST_TIMEOUT_MS, 120_000, 1_000, 600_000),
    dailyLimit: numberFromEnvironment(env.AI_DAILY_TOOL_LIMIT, 30, 1, 10_000),
  };
}

function brainstormModelSelection(env: Environment) {
  const brainstorm = env.AI_BRAINSTORM_MODEL?.trim();
  const tool = env.AI_TOOL_MODEL?.trim();
  const base = env.AI_MODEL?.trim();
  const workerModel = brainstorm || tool || base || "";
  const synthesis = env.AI_BRAINSTORM_SYNTHESIS_MODEL?.trim();
  return {
    workerModel,
    synthesisModel: synthesis || workerModel,
    workerModelSource: (brainstorm ? "brainstorm" : tool ? "tool" : "base") as BrainstormGenerationConfig["workerModelSource"],
    synthesisModelSource: (synthesis ? "synthesis" : brainstorm ? "brainstorm" : tool ? "tool" : "base") as BrainstormGenerationConfig["synthesisModelSource"],
  };
}

export function getBrainstormConfigurationStatus(env: Environment = process.env) {
  const models = brainstormModelSelection(env);
  const missing = [
    ...(["AI_BASE_URL", "AI_API_KEY"] as const).filter((key) => !env[key]?.trim()),
    ...(!models.workerModel ? ["AI_BRAINSTORM_MODEL / AI_TOOL_MODEL / AI_MODEL"] : []),
  ];
  return { configured: missing.length === 0 && (!env.AI_PROVIDER || env.AI_PROVIDER === "openai-compatible"), missing };
}

export function getBrainstormGenerationConfig(env: Environment = process.env): BrainstormGenerationConfig {
  const status = getBrainstormConfigurationStatus(env);
  if (!status.configured) throw new AiProviderError("CONFIGURATION", "Brainstorm provider configuration is incomplete.");
  const models = brainstormModelSelection(env);
  return {
    ...models,
    temperature: numberFromEnvironment(env.AI_BRAINSTORM_TEMPERATURE, 0.6, 0, 2),
    workerMaxOutputTokens: numberFromEnvironment(env.AI_BRAINSTORM_MAX_OUTPUT_TOKENS, 1400, 200, 8000),
    synthesisMaxOutputTokens: numberFromEnvironment(env.AI_BRAINSTORM_SYNTHESIS_MAX_OUTPUT_TOKENS, 2600, 400, 12_000),
    requestTimeoutMs: numberFromEnvironment(env.AI_BRAINSTORM_REQUEST_TIMEOUT_MS, 180_000, 1_000, 300_000),
    totalTimeoutMs: numberFromEnvironment(env.AI_BRAINSTORM_TOTAL_TIMEOUT_MS, 285_000, 1_000, 285_000),
    dailyLimit: getBrainstormDailyLimit(env),
    maxConcurrency: numberFromEnvironment(env.AI_BRAINSTORM_MAX_CONCURRENCY, 4, 1, 4),
  };
}

export function getBrainstormDailyLimit(env: Environment = process.env) {
  return numberFromEnvironment(env.AI_DAILY_BRAINSTORM_LIMIT, 3, 1, 1000);
}

export function requireBrainstormProviderConfig(env: Environment = process.env): AiProviderConfig {
  const generation = getBrainstormGenerationConfig(env);
  return {
    provider: "openai-compatible",
    baseUrl: env.AI_BASE_URL!.trim(),
    apiKey: env.AI_API_KEY!.trim(),
    model: generation.workerModel,
    temperature: generation.temperature,
    maxOutputTokens: generation.workerMaxOutputTokens,
    requestTimeoutMs: generation.requestTimeoutMs,
  };
}

function agentModelSelection(env: Environment) {
  const brainstorm = env.AI_BRAINSTORM_MODEL?.trim();
  const tool = env.AI_TOOL_MODEL?.trim();
  const base = env.AI_MODEL?.trim();
  const planner = env.AI_AGENT_PLANNER_MODEL?.trim();
  const worker = env.AI_AGENT_WORKER_MODEL?.trim();
  const leader = env.AI_AGENT_LEADER_MODEL?.trim();
  const brainstormSynthesis = env.AI_BRAINSTORM_SYNTHESIS_MODEL?.trim();
  const plannerModel = planner || brainstorm || tool || base || "";
  const workerModel = worker || brainstorm || tool || base || "";
  const leaderModel = leader || worker || brainstormSynthesis || tool || base || "";
  return {
    plannerModel,
    workerModel,
    leaderModel,
    plannerModelSource: (planner ? "agent-planner" : brainstorm ? "brainstorm" : tool ? "tool" : "base") as AgentGenerationConfig["plannerModelSource"],
    workerModelSource: (worker ? "agent-worker" : brainstorm ? "brainstorm" : tool ? "tool" : "base") as AgentGenerationConfig["workerModelSource"],
    leaderModelSource: (leader ? "agent-leader" : worker ? "agent-worker" : brainstormSynthesis ? "brainstorm-synthesis" : tool ? "tool" : "base") as AgentGenerationConfig["leaderModelSource"],
  };
}

export function getAgentConfigurationStatus(env: Environment = process.env) {
  const models = agentModelSelection(env);
  const missing = [
    ...(["AI_BASE_URL", "AI_API_KEY"] as const).filter((key) => !env[key]?.trim()),
    ...(!models.plannerModel ? ["AI_AGENT_PLANNER_MODEL / fallback"] : []),
    ...(!models.workerModel ? ["AI_AGENT_WORKER_MODEL / fallback"] : []),
    ...(!models.leaderModel ? ["AI_AGENT_LEADER_MODEL / fallback"] : []),
  ];
  return { configured: missing.length === 0 && (!env.AI_PROVIDER || env.AI_PROVIDER === "openai-compatible"), missing };
}

export function getAgentGenerationConfig(env: Environment = process.env): AgentGenerationConfig {
  if (!getAgentConfigurationStatus(env).configured) {
    throw new AiProviderError("CONFIGURATION", "Agent provider configuration is incomplete.");
  }
  return {
    ...agentModelSelection(env),
    temperature: numberFromEnvironment(env.AI_AGENT_TEMPERATURE, 0.5, 0, 1),
    plannerMaxOutputTokens: numberFromEnvironment(env.AI_AGENT_PLANNER_MAX_OUTPUT_TOKENS, 1200, 200, 4000),
    workerMaxOutputTokens: numberFromEnvironment(env.AI_AGENT_WORKER_MAX_OUTPUT_TOKENS, 1800, 200, 8000),
    leaderMaxOutputTokens: numberFromEnvironment(env.AI_AGENT_LEADER_MAX_OUTPUT_TOKENS, 3200, 400, 12_000),
    requestTimeoutMs: numberFromEnvironment(env.AI_AGENT_REQUEST_TIMEOUT_MS, 120_000, 1_000, 285_000),
    totalTimeoutMs: numberFromEnvironment(env.AI_AGENT_TOTAL_TIMEOUT_MS, 285_000, 1_000, 285_000),
    dailyCredits: numberFromEnvironment(env.AI_DAILY_AGENT_CREDITS, 6, 1, 1000),
  };
}

export function requireAgentProviderConfig(env: Environment = process.env): AiProviderConfig {
  const generation = getAgentGenerationConfig(env);
  return {
    provider: "openai-compatible",
    baseUrl: env.AI_BASE_URL!.trim(),
    apiKey: env.AI_API_KEY!.trim(),
    model: generation.plannerModel,
    temperature: generation.temperature,
    maxOutputTokens: generation.plannerMaxOutputTokens,
    requestTimeoutMs: generation.requestTimeoutMs,
  };
}

export function getAiRuntimeLimits(env: Environment = process.env): AiRuntimeLimits {
  return {
    dailyMessageLimit: numberFromEnvironment(env.AI_DAILY_MESSAGE_LIMIT, DEFAULTS.dailyMessageLimit, 1, 10_000),
    maxInputChars: numberFromEnvironment(env.AI_MAX_INPUT_CHARS, DEFAULTS.maxInputChars, 1, 100_000),
  };
}

export function getAiConfigurationStatus(env: Environment = process.env) {
  const missing = ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"].filter((key) => !env[key]?.trim());
  const providerSupported = !env.AI_PROVIDER || env.AI_PROVIDER === "openai-compatible";

  return {
    configured: missing.length === 0 && providerSupported,
    missing,
    providerSupported,
  };
}

export function requireAiProviderConfig(env: Environment = process.env): AiProviderConfig {
  const status = getAiConfigurationStatus(env);

  if (!status.configured) {
    throw new AiProviderError("CONFIGURATION", "AI provider configuration is incomplete.");
  }

  return {
    provider: "openai-compatible",
    baseUrl: env.AI_BASE_URL!.trim(),
    apiKey: env.AI_API_KEY!.trim(),
    model: env.AI_MODEL!.trim(),
    temperature: numberFromEnvironment(env.AI_TEMPERATURE, DEFAULTS.temperature, 0, 2),
    maxOutputTokens: numberFromEnvironment(
      env.AI_MAX_OUTPUT_TOKENS,
      DEFAULTS.maxOutputTokens,
      1,
      128_000,
    ),
    requestTimeoutMs: numberFromEnvironment(
      env.AI_REQUEST_TIMEOUT_MS,
      DEFAULTS.requestTimeoutMs,
      1_000,
      600_000,
    ),
  };
}
