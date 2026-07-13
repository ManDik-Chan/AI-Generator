export type EmbeddingErrorCode =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE"
  | "UNKNOWN";

export class EmbeddingProviderError extends Error {
  constructor(
    public readonly code: EmbeddingErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}
