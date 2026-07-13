import type { AiProviderConfig } from "@/lib/ai/types";

export interface VisionConfig extends AiProviderConfig {
  dailyLimit: number;
}

export interface VisionRequest {
  system: string;
  question: string;
  image: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  signal?: AbortSignal;
}

export interface VisionProvider {
  streamImageAnalysis(request: VisionRequest): AsyncIterable<string>;
}
