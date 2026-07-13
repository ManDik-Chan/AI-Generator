import { Prisma } from "@prisma/client";
import { AiProviderError } from "@/lib/ai/errors";
import type { AiStreamRequest } from "@/lib/ai/types";
import { getMemoryAiProvider } from "@/lib/ai/registry";
import { buildMemoryExtractorMessages, buildMemoryJsonRepairMessages } from "@/lib/ai/prompts/memory-extractor";
import { prisma } from "@/lib/database/prisma";
import {
  MEMORY_EXTRACTION_CONFIDENCE,
  detectExplicitMemoryIntent,
  hasTraceableUserEvidence,
  parseMemoryExtractionOutput,
  selectExtractionCandidates,
  shouldRunMemoryExtraction,
} from "@/features/memory/extraction";
import { containsHighConfidenceCredential, normalizeMemoryContent } from "@/features/memory/security";
import { getMemoryMaxTotal } from "@/features/memory/constants";
import { MemoryExtractionFailure, type MemoryExtractionStage } from "@/features/memory/diagnostics";
import { requestMemoryModelText } from "@/features/memory/provider";

interface ExtractMemoryInput {
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  assistantMessageId: string;
  currentUserMessage: string;
  assistantResponse: string;
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
  persona?: { id: string; name: string };
}

export async function extractAndPersistMemories(input: ExtractMemoryInput) {
  const explicitIntent = detectExplicitMemoryIntent(input.currentUserMessage);
  let stage: MemoryExtractionStage = "eligibility";
  let configuredModel: string | undefined;
  try {
    if (!shouldRunMemoryExtraction(input.currentUserMessage)) return { created: 0, updated: 0 };

  const eligibility = await prisma.message.findFirst({
    where: {
      id: input.sourceMessageId,
      conversationId: input.conversationId,
      role: "USER",
      status: "COMPLETE",
      supersededAt: null,
      conversation: { userId: input.userId, user: { memoryEnabled: true } },
    },
    select: {
      id: true,
      conversation: { select: { personaId: true } },
    },
  });
  const assistantComplete = await prisma.message.findFirst({
    where: { id: input.assistantMessageId, conversationId: input.conversationId, role: "ASSISTANT", status: "COMPLETE", supersededAt: null },
    select: { id: true },
  });
  if (!eligibility || !assistantComplete) return { created: 0, updated: 0 };

  const alreadyProcessed = await prisma.memory.findFirst({
    where: { userId: input.userId, sourceMessageId: input.sourceMessageId, origin: "AUTO_EXTRACTED" },
    select: { id: true },
  });
  if (alreadyProcessed) return { created: 0, updated: 0 };

  stage = "load_context";
  let priorUserMessages: string[] = [];
  let supportingAssistantMessages: string[] = [];
  if (explicitIntent) {
    const history = await prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        id: { not: input.sourceMessageId },
        status: "COMPLETE",
        supersededAt: null,
        role: { in: ["USER", "ASSISTANT"] },
        conversation: { userId: input.userId },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: { role: true, content: true },
    });
    const chronological = history.reverse();
    priorUserMessages = chronological.filter((message) => message.role === "USER").slice(-15).map((message) => message.content);
    supportingAssistantMessages = chronological.filter((message) => message.role === "ASSISTANT").slice(-5).map((message) => message.content);
  }

  const rows = await prisma.memory.findMany({
    where: {
      userId: input.userId,
      OR: [
        { scope: "GLOBAL" },
        ...(eligibility.conversation.personaId ? [{ scope: "PERSONA" as const, personaId: eligibility.conversation.personaId }] : []),
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { importance: "desc" }],
    take: 100,
    select: { id: true, content: true, category: true, scope: true, importance: true, updatedAt: true, topicKey: true, keywords: true, pinned: true, useCount: true, lastUsedAt: true },
  });
  const candidates = selectExtractionCandidates([input.currentUserMessage, ...priorUserMessages].join("\n"), rows);
  stage = "provider_request";
  const { config, fallbackModel, provider } = getMemoryAiProvider();
  configuredModel = config.model;
  const providerRequest: AiStreamRequest = {
    messages: buildMemoryExtractorMessages({
        currentUserMessage: input.currentUserMessage,
        assistantResponse: input.assistantResponse,
        recentTurns: input.recentTurns.slice(-8),
        explicitIntent,
        priorUserMessages,
        supportingAssistantMessages,
        persona: eligibility.conversation.personaId && input.persona?.id === eligibility.conversation.personaId ? input.persona : undefined,
        existingMemories: candidates,
      }),
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
  };
  const initialResponse = await requestMemoryModelText({ provider, request: providerRequest, fallbackModel });
  stage = "provider_response";
  const output = initialResponse.text;
  let parsed;
  try {
    stage = "parse";
    parsed = parseMemoryExtractionOutput(output);
  } catch {
    stage = "repair_request";
    const repaired = await requestMemoryModelText({ provider, fallbackModel: initialResponse.modelUsed, allowProviderRetry: false, request: { messages: buildMemoryJsonRepairMessages(output), model: initialResponse.modelUsed, temperature: 0, maxOutputTokens: config.maxOutputTokens } });
    stage = "parse";
    parsed = parseMemoryExtractionOutput(repaired.text);
  }
  stage = "validate";
  const candidateIds = new Set(candidates.map((memory) => memory.id));

  stage = "persist";
  return prisma.$transaction(async (transaction) => {
    const sourceStillActive = await transaction.message.findFirst({
      where: { id: input.sourceMessageId, conversationId: input.conversationId, role: "USER", status: "COMPLETE", supersededAt: null, conversation: { userId: input.userId, user: { memoryEnabled: true } } },
      select: { id: true },
    });
    if (!sourceStillActive) return { created: 0, updated: 0 };
    const marker = await transaction.memory.findFirst({ where: { userId: input.userId, sourceMessageId: input.sourceMessageId, origin: "AUTO_EXTRACTED" }, select: { id: true } });
    if (marker) return { created: 0, updated: 0 };

    let created = 0;
    let updated = 0;
    for (const operation of parsed.operations) {
      if (operation.action === "IGNORE" || ["temporary", "uncertain", "sensitive"].includes(operation.reasonCode) || operation.confidence < MEMORY_EXTRACTION_CONFIDENCE || !operation.content || !operation.category || !operation.scope || !operation.importance) continue;
      if (containsHighConfidenceCredential(operation.content)) continue;
      if (explicitIntent) {
        const userEvidence = explicitIntent === "INLINE_FACT" ? [...priorUserMessages, input.currentUserMessage] : priorUserMessages;
        if (!hasTraceableUserEvidence(operation.content, userEvidence)) continue;
      }
      const personaId = operation.scope === "PERSONA" ? eligibility.conversation.personaId : null;
      if (operation.scope === "PERSONA" && !personaId) continue;
      const normalized = normalizeMemoryContent(operation.content);
      const duplicates = await transaction.memory.findMany({ where: { userId: input.userId, scope: operation.scope, personaId }, select: { id: true, content: true } });
      const duplicate = duplicates.find((memory) => normalizeMemoryContent(memory.content) === normalized);

      if (operation.action === "CREATE") {
        if (duplicate) continue;
        const sameTopic = operation.topicKey ? await transaction.memory.findFirst({ where: { userId: input.userId, scope: operation.scope, personaId, topicKey: operation.topicKey }, orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { id: "asc" }], select: { id: true } }) : null;
        if (sameTopic) {
          const result = await transaction.memory.updateMany({ where: { id: sameTopic.id, userId: input.userId }, data: { content: operation.content, category: operation.category, importance: operation.importance, keywords: operation.keywords, origin: "AUTO_EXTRACTED", sourceConversationId: input.conversationId, sourceMessageId: input.sourceMessageId } });
          updated += result.count;
          continue;
        }
        const limit = getMemoryMaxTotal();
        const total = await transaction.memory.count({ where: { userId: input.userId } });
        if (total >= limit) { console.warn("memory_capacity_reached", { userId: input.userId, conversationId: input.conversationId, sourceMessageId: input.sourceMessageId, limit }); continue; }
        await transaction.memory.create({ data: { userId: input.userId, content: operation.content, category: operation.category, scope: operation.scope, personaId, importance: operation.importance, topicKey: operation.topicKey!, keywords: operation.keywords, enabled: true, origin: "AUTO_EXTRACTED", sourceConversationId: input.conversationId, sourceMessageId: input.sourceMessageId } });
        created += 1;
      } else if (operation.action === "UPDATE" && operation.existingMemoryId && candidateIds.has(operation.existingMemoryId)) {
        if (duplicate) continue;
        const candidate = candidates.find((memory) => memory.id === operation.existingMemoryId);
        const targetTopic = operation.topicKey ?? candidate?.topicKey ?? null;
        const topicTarget = targetTopic ? await transaction.memory.findFirst({ where: { userId: input.userId, scope: operation.scope, personaId, topicKey: targetTopic }, orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { id: "asc" }], select: { id: true } }) : null;
        const result = await transaction.memory.updateMany({ where: { id: topicTarget?.id ?? operation.existingMemoryId, userId: input.userId }, data: { content: operation.content, category: operation.category, scope: operation.scope, personaId, importance: operation.importance, topicKey: targetTopic, keywords: operation.keywords.length ? operation.keywords : candidate?.keywords ?? [], origin: "AUTO_EXTRACTED", sourceConversationId: input.conversationId, sourceMessageId: input.sourceMessageId } });
        updated += result.count;
      }
    }
    return { created, updated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const resolvedStage = stage === "provider_request" && error instanceof AiProviderError && ["INVALID_RESPONSE", "EMPTY_RESPONSE"].includes(error.code) ? "provider_response" : stage;
    throw new MemoryExtractionFailure(resolvedStage, error, explicitIntent, configuredModel);
  }
}
