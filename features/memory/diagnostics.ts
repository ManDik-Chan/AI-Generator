import { AiProviderError } from "@/lib/ai/errors";

export type MemoryExtractionStage = "eligibility" | "load_context" | "provider_request" | "provider_response" | "parse" | "repair_request" | "validate" | "persist";

export class MemoryExtractionFailure extends Error {
  constructor(
    public readonly stage: MemoryExtractionStage,
    public readonly originalError: unknown,
    public readonly explicitIntent?: "INLINE_FACT" | "PREVIOUS_CONTEXT",
    public readonly configuredModel?: string,
  ) {
    super("Automatic memory extraction failed.");
    this.name = "MemoryExtractionFailure";
  }
}

export function safeMemoryFailureDetails(error: unknown) {
  const failure = error instanceof MemoryExtractionFailure ? error : undefined;
  const original = failure?.originalError ?? error;
  const provider = original instanceof AiProviderError ? original : undefined;
  return {
    stage: failure?.stage ?? "persist",
    explicitIntent: failure?.explicitIntent,
    providerCode: provider?.code,
    providerStatus: provider?.status,
    providerErrorCode: provider?.diagnostics?.providerErrorCode,
    providerMessage: provider?.diagnostics?.providerMessage,
    configuredModel: failure?.configuredModel,
    ...(!provider ? { errorCode: original instanceof Error ? original.name : "UNKNOWN" } : {}),
  };
}
