import { Prisma } from "@prisma/client";

import { AiProviderError } from "@/lib/ai/errors";
import type { AiStreamRequest } from "@/lib/ai/types";
import { getMemoryAiProvider } from "@/lib/ai/registry";
import {
  buildMemoryExtractorMessages,
  buildMemoryJsonRepairMessages,
} from "@/lib/ai/prompts/memory-extractor";
import { prisma } from "@/lib/database/prisma";
import {
  MEMORY_EXTRACTION_CONFIDENCE,
  detectExplicitMemoryIntent,
  hasTraceableUserEvidence,
  parseMemoryExtractionOutput,
  selectExtractionCandidates,
  shouldRunMemoryExtraction,
  type MemoryExtractionOperation,
} from "@/features/memory/extraction";
import {
  containsHighConfidenceCredential,
  normalizeMemoryContent,
} from "@/features/memory/security";
import {
  MemoryExtractionFailure,
  type MemoryExtractionStage,
} from "@/features/memory/diagnostics";
import { requestMemoryModelText } from "@/features/memory/provider";
import {
  buildMemoryProposalDedupeKey,
  buildMemoryProposalSuppressionKey,
  getMemoryProposalExpiry,
  getMemoryProposalRejectionCutoff,
} from "@/features/memory/proposal-utils";
import {
  persistTrustedMemoryChange,
  lockTrustedMemoryUser,
  TrustedMemoryWriteError,
  runSerializableMemoryTransaction,
} from "@/features/memory/trusted-write";

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

export interface MemoryExtractionPersistResult {
  proposed: number;
  created: number;
  updated: number;
  memoryIds: string[];
}

const emptyResult = (): MemoryExtractionPersistResult => ({
  proposed: 0,
  created: 0,
  updated: 0,
  memoryIds: [],
});

function isEligibleOperation(operation: MemoryExtractionOperation) {
  return operation.action !== "IGNORE"
    && !["temporary", "uncertain", "sensitive"].includes(operation.reasonCode)
    && operation.confidence >= MEMORY_EXTRACTION_CONFIDENCE
    && Boolean(
      operation.content
      && operation.category
      && operation.scope
      && operation.importance,
    )
    && !containsHighConfidenceCredential(operation.content ?? "");
}

export async function extractAndPersistMemoryProposals(
  input: ExtractMemoryInput,
): Promise<MemoryExtractionPersistResult> {
  const explicitIntent = detectExplicitMemoryIntent(input.currentUserMessage);
  let stage: MemoryExtractionStage = "eligibility";
  let configuredModel: string | undefined;
  try {
    if (!shouldRunMemoryExtraction(input.currentUserMessage)) return emptyResult();

    const eligibility = await prisma.message.findFirst({
      where: {
        id: input.sourceMessageId,
        conversationId: input.conversationId,
        role: "USER",
        status: "COMPLETE",
        supersededAt: null,
        conversation: {
          userId: input.userId,
          user: { memoryEnabled: true },
        },
      },
      select: {
        id: true,
        conversation: { select: { personaId: true } },
      },
    });
    const assistantComplete = await prisma.message.findFirst({
      where: {
        id: input.assistantMessageId,
        conversationId: input.conversationId,
        role: "ASSISTANT",
        status: "COMPLETE",
        supersededAt: null,
      },
      select: { id: true },
    });
    if (!eligibility || !assistantComplete) return emptyResult();

    const alreadyProcessed = explicitIntent
      ? await prisma.memory.findFirst({
          where: {
            userId: input.userId,
            sourceMessageId: input.sourceMessageId,
            origin: "AUTO_EXTRACTED",
          },
          select: { id: true },
        })
      : null;
    if (alreadyProcessed) return emptyResult();

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
      priorUserMessages = chronological
        .filter((message) => message.role === "USER")
        .slice(-15)
        .map((message) => message.content);
      supportingAssistantMessages = chronological
        .filter((message) => message.role === "ASSISTANT")
        .slice(-5)
        .map((message) => message.content);
    }

    const rows = await prisma.memory.findMany({
      where: {
        userId: input.userId,
        enabled: true,
        OR: [
          { scope: "GLOBAL" },
          ...(eligibility.conversation.personaId
            ? [{
                scope: "PERSONA" as const,
                personaId: eligibility.conversation.personaId,
              }]
            : []),
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { importance: "desc" }],
      take: 100,
      select: {
        id: true,
        content: true,
        category: true,
        scope: true,
        importance: true,
        updatedAt: true,
        revision: true,
        topicKey: true,
        keywords: true,
        pinned: true,
        useCount: true,
        lastUsedAt: true,
      },
    });
    const candidates = selectExtractionCandidates(
      [input.currentUserMessage, ...priorUserMessages].join("\n"),
      rows,
    );

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
        persona:
          eligibility.conversation.personaId
          && input.persona?.id === eligibility.conversation.personaId
            ? input.persona
            : undefined,
        existingMemories: candidates,
      }),
      model: config.model,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      thinking: "disabled",
    };
    const initialResponse = await requestMemoryModelText({
      provider,
      request: providerRequest,
      fallbackModel,
    });
    stage = "provider_response";
    let parsed;
    try {
      stage = "parse";
      parsed = parseMemoryExtractionOutput(initialResponse.text);
    } catch {
      stage = "repair_request";
      const repaired = await requestMemoryModelText({
        provider,
        fallbackModel: initialResponse.modelUsed,
        allowProviderRetry: false,
        request: {
          messages: buildMemoryJsonRepairMessages(initialResponse.text),
          model: initialResponse.modelUsed,
          temperature: 0,
          maxOutputTokens: config.maxOutputTokens,
          thinking: "disabled",
        },
      });
      stage = "parse";
      parsed = parseMemoryExtractionOutput(repaired.text);
    }

    stage = "validate";
    const candidateIds = new Set(candidates.map((memory) => memory.id));
    const explicitEvidence = explicitIntent === "INLINE_FACT"
      ? [...priorUserMessages, input.currentUserMessage]
      : priorUserMessages;

    stage = "persist";
    return await runSerializableMemoryTransaction(async (transaction) => {
      if (explicitIntent) {
        await lockTrustedMemoryUser(transaction, input.userId, true);
      }
      const sourceStillActive = await transaction.message.findFirst({
        where: {
          id: input.sourceMessageId,
          conversationId: input.conversationId,
          role: "USER",
          status: "COMPLETE",
          supersededAt: null,
          conversation: {
            userId: input.userId,
            user: { memoryEnabled: true },
          },
        },
        select: { id: true },
      });
      if (!sourceStillActive) return emptyResult();

      const marker = explicitIntent
        ? await transaction.memory.findFirst({
            where: {
              userId: input.userId,
              sourceMessageId: input.sourceMessageId,
              origin: "AUTO_EXTRACTED",
            },
            select: { id: true },
          })
        : null;
      if (marker) return emptyResult();

      let created = 0;
      let updated = 0;
      const memoryIds = new Set<string>();
      const proposalRows: Prisma.MemoryProposalCreateManyInput[] = [];
      const now = new Date();

      for (const operation of parsed.operations) {
        if (operation.action === "IGNORE") continue;
        if (!isEligibleOperation(operation)) continue;
        const content = operation.content!;
        const category = operation.category!;
        const scope = operation.scope!;
        const importance = operation.importance!;
        const personaId = scope === "PERSONA"
          ? eligibility.conversation.personaId
          : null;
        if (scope === "PERSONA" && !personaId) continue;

        const evidence = explicitIntent ? explicitEvidence : [input.currentUserMessage];
        if (!hasTraceableUserEvidence(content, evidence)) continue;

        const candidate = operation.action === "UPDATE" && operation.existingMemoryId
          ? candidates.find((memory) => memory.id === operation.existingMemoryId)
          : undefined;
        if (operation.action === "UPDATE" && (!candidate || !candidateIds.has(candidate.id))) {
          continue;
        }
        const topicKey = operation.topicKey ?? candidate?.topicKey ?? null;
        const keywords = operation.keywords.length
          ? operation.keywords
          : candidate?.keywords ?? [];

        if (explicitIntent) {
          try {
            const written = await persistTrustedMemoryChange(transaction, {
              userId: input.userId,
              action: operation.action,
              targetMemoryId: candidate?.id,
              targetMemoryUpdatedAt: candidate?.updatedAt,
              targetMemoryRevision: candidate?.revision,
              content,
              category,
              scope,
              personaId,
              importance,
              topicKey,
              keywords,
              sourceConversationId: input.conversationId,
              sourceMessageId: input.sourceMessageId,
              origin: "AUTO_EXTRACTED",
              userLockAlreadyHeld: true,
            });
            created += Number(written.created);
            updated += Number(written.updated);
            memoryIds.add(written.memoryId);
          } catch (error) {
            if (error instanceof TrustedMemoryWriteError) continue;
            throw error;
          }
          continue;
        }

        const scopedMemories = await transaction.memory.findMany({
          where: { userId: input.userId, scope, personaId },
          select: { id: true, content: true },
        });
        const normalized = normalizeMemoryContent(content);
        const exact = scopedMemories.find(
          (memory) => normalizeMemoryContent(memory.content) === normalized,
        );
        if (exact) continue;

        let action: "CREATE" | "UPDATE" = operation.action;
        let targetMemoryId = candidate?.id ?? null;
        let targetMemoryUpdatedAt = candidate ? new Date(candidate.updatedAt) : null;
        let targetMemoryRevision = candidate?.revision ?? null;
        if (action === "CREATE" && topicKey) {
          const sameTopic = await transaction.memory.findFirst({
            where: {
              userId: input.userId,
              scope,
              personaId,
              topicKey,
              enabled: true,
            },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            select: { id: true, updatedAt: true, revision: true },
          });
          if (sameTopic) {
            action = "UPDATE";
            targetMemoryId = sameTopic.id;
            targetMemoryUpdatedAt = sameTopic.updatedAt;
            targetMemoryRevision = sameTopic.revision;
          }
        }
        if (action === "UPDATE") {
          if (!targetMemoryId || !targetMemoryUpdatedAt || !targetMemoryRevision) continue;
          const targetExists = await transaction.memory.findFirst({
            where: {
              id: targetMemoryId,
              userId: input.userId,
              enabled: true,
              scope,
              personaId,
            },
            select: { id: true, revision: true },
          });
          if (!targetExists || targetExists.revision !== targetMemoryRevision) continue;
        }

        const dedupeKey = buildMemoryProposalDedupeKey({
          sourceMessageId: input.sourceMessageId,
          action,
          scope,
          personaId,
          targetMemoryId,
          targetMemoryRevision,
          topicKey,
          content,
          keywords,
        });
        const suppressionKey = buildMemoryProposalSuppressionKey({
          action,
          scope,
          personaId,
          targetMemoryId,
          topicKey,
          content,
          keywords,
        });
        proposalRows.push({
          userId: input.userId,
          personaId,
          action,
          status: "PENDING",
          targetMemoryId,
          targetMemoryUpdatedAt,
          targetMemoryRevision,
          content,
          category,
          scope,
          importance,
          topicKey,
          keywords,
          confidence: operation.confidence,
          reasonCode: operation.reasonCode,
          sourceConversationId: input.conversationId,
          sourceMessageId: input.sourceMessageId,
          dedupeKey,
          suppressionKey,
          expiresAt: getMemoryProposalExpiry(now),
          createdAt: now,
          updatedAt: now,
        });
      }

      const uniqueRows = [...new Map(
        proposalRows.map((row) => [row.dedupeKey, row]),
      ).values()];
      const rejected = uniqueRows.length
        ? await transaction.memoryProposal.findMany({
            where: {
              userId: input.userId,
              status: "REJECTED",
              suppressionKey: {
                in: uniqueRows.map((row) => row.suppressionKey),
              },
              resolvedAt: { gte: getMemoryProposalRejectionCutoff(now) },
            },
            select: { suppressionKey: true },
          })
        : [];
      const suppressed = new Set(rejected.map((row) => row.suppressionKey));
      const acceptedRows = uniqueRows.filter(
        (row) => !suppressed.has(row.suppressionKey),
      );
      const proposals = acceptedRows.length
        ? await transaction.memoryProposal.createMany({
            data: acceptedRows,
            skipDuplicates: true,
          })
        : { count: 0 };
      return {
        proposed: proposals.count,
        created,
        updated,
        memoryIds: [...memoryIds],
      };
    });
  } catch (error) {
    const resolvedStage =
      stage === "provider_request"
      && error instanceof AiProviderError
      && ["INVALID_RESPONSE", "EMPTY_RESPONSE", "REASONING_ONLY_RESPONSE"].includes(error.code)
        ? "provider_response"
        : stage;
    throw new MemoryExtractionFailure(
      resolvedStage,
      error,
      explicitIntent,
      configuredModel,
    );
  }
}

/** @deprecated Use the proposal-oriented name for new call sites. */
export const extractAndPersistMemories = extractAndPersistMemoryProposals;
