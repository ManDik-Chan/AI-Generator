import { EmbeddingProviderError } from "@/lib/ai/embeddings/errors";
import { getEmbeddingConfigurationStatus, getMemorySemanticConfig, requireEmbeddingProviderConfig } from "@/lib/ai/embeddings/config";
import { createOpenAiCompatibleEmbeddingProvider } from "@/lib/ai/embeddings/openai-compatible";
import { hasAvailableMemoryEmbedding, searchSemanticMemories } from "@/features/memory/embedding-repository";
import {
  fuseMemoryRankings,
  isMemoryOverviewIntent,
  isMemorySeekingIntent,
  isTrivialSemanticMessage,
  rankDeterministicMemories,
  selectRelevantMemories,
  type SelectMemoryOptions,
} from "@/features/memory/selection";

export type SemanticRecallStage = "configuration" | "availability" | "provider" | "query" | "fusion";

export function shouldRequestSemanticRecall(input: {
  mode: "off" | "adaptive" | "always";
  currentMessage: string;
  candidateCount: number;
  deterministicCount: number;
  hasDirectMatch: boolean;
  hasAvailableEmbeddings: boolean;
}) {
  if (input.mode === "off" || input.candidateCount === 0) return false;
  if (input.mode === "always") return true;
  if (!input.hasAvailableEmbeddings || isTrivialSemanticMessage(input.currentMessage)) return false;
  return input.deterministicCount < 2 || !input.hasDirectMatch || isMemoryOverviewIntent(input.currentMessage) || isMemorySeekingIntent(input.currentMessage);
}

function semanticErrorCode(error: unknown) {
  return error instanceof EmbeddingProviderError ? error.code : error instanceof Error ? error.name : "UNKNOWN";
}

export async function retrieveRelevantMemories(input: SelectMemoryOptions & {
  userId: string;
  conversationId: string;
  requestId: string;
}) {
  const startedAt = Date.now();
  const deterministicRanking = rankDeterministicMemories(input);
  const deterministic = selectRelevantMemories(input);
  const semantic = getMemorySemanticConfig();
  let stage: SemanticRecallStage = "configuration";
  let semanticRequested = false;
  const logMetrics = (details: { semanticSucceeded: boolean; semanticCandidateCount: number; fallbackReason?: string }) => console.info("memory_semantic_metrics", { requestId: input.requestId, userId: input.userId, conversationId: input.conversationId, semanticRequested, ...details, durationMs: Date.now() - startedAt });
  try {
    if (semantic.mode === "off") { logMetrics({ semanticSucceeded: false, semanticCandidateCount: 0, fallbackReason: "MODE_OFF" }); return deterministic; }
    const embeddingStatus = getEmbeddingConfigurationStatus();
    if (!embeddingStatus.configured) { logMetrics({ semanticSucceeded: false, semanticCandidateCount: 0, fallbackReason: "CONFIGURATION" }); return deterministic; }
    const embeddingConfig = requireEmbeddingProviderConfig();
    stage = "availability";
    const available = semantic.mode === "always" ? true : await hasAvailableMemoryEmbedding({ userId: input.userId, personaId: input.personaId, model: embeddingConfig.model, dimensions: embeddingConfig.dimensions });
    if (!shouldRequestSemanticRecall({
      mode: semantic.mode,
      currentMessage: input.currentMessage,
      candidateCount: input.candidates.length,
      deterministicCount: deterministic.length,
      hasDirectMatch: deterministicRanking[0]?.directMatch ?? false,
      hasAvailableEmbeddings: available,
    })) { logMetrics({ semanticSucceeded: false, semanticCandidateCount: 0, fallbackReason: available ? "ADAPTIVE_SKIP" : "NO_VECTOR" }); return deterministic; }
    semanticRequested = true;
    stage = "provider";
    const provider = createOpenAiCompatibleEmbeddingProvider(embeddingConfig);
    const [queryEmbedding] = await provider.embed({ input: input.currentMessage, model: embeddingConfig.model, dimensions: embeddingConfig.dimensions });
    stage = "query";
    const semanticCandidates = await searchSemanticMemories({ userId: input.userId, personaId: input.personaId, queryEmbedding, model: embeddingConfig.model, dimensions: embeddingConfig.dimensions, threshold: semantic.threshold, limit: semantic.maxCandidates });
    stage = "fusion";
    const result = fuseMemoryRankings({ deterministic: deterministicRanking, semantic: semanticCandidates, personaId: input.personaId, maxItems: input.maxItems, maxChars: input.maxChars });
    logMetrics({ semanticSucceeded: true, semanticCandidateCount: semanticCandidates.length });
    return result;
  } catch (error) {
    console.warn("memory_semantic_fallback", { requestId: input.requestId, userId: input.userId, conversationId: input.conversationId, stage, errorCode: semanticErrorCode(error) });
    logMetrics({ semanticSucceeded: false, semanticCandidateCount: 0, fallbackReason: semanticErrorCode(error) });
    return deterministic;
  }
}
