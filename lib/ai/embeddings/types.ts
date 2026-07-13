export type EmbeddingInput = string | string[];

export interface EmbeddingProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: 512;
  timeoutMs: number;
}

export interface EmbeddingRequest {
  input: EmbeddingInput;
  model: string;
  dimensions: 512;
  signal?: AbortSignal;
}

export interface EmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<number[][]>;
}

export type MemorySemanticMode = "off" | "adaptive" | "always";

export interface MemorySemanticConfig {
  mode: MemorySemanticMode;
  threshold: number;
  maxCandidates: number;
}
