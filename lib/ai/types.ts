export type AiMessageRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiMessageRole;
  content: string;
}

export interface AiStreamRequest {
  messages: AiMessage[];
  model: string;
  temperature: number;
  maxOutputTokens: number;
  thinking?: "enabled" | "disabled";
  signal?: AbortSignal;
}

export interface AiProvider {
  streamText(request: AiStreamRequest): AsyncIterable<string>;
}

export interface PersonaGenerationConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}

export interface MemoryGenerationConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}

export interface ToolGenerationConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  dailyLimit: number;
}

export interface AiProviderConfig {
  provider: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}

export interface AiRuntimeLimits {
  dailyMessageLimit: number;
  maxInputChars: number;
}
