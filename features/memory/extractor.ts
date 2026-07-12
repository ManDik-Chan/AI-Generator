import { Prisma } from "@prisma/client";
import { collectGeneratedText } from "@/lib/ai/collect-text";
import { getMemoryAiProvider } from "@/lib/ai/registry";
import { buildMemoryExtractorPrompt, buildMemoryJsonRepairPrompt } from "@/lib/ai/prompts/memory-extractor";
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

  const explicitIntent = detectExplicitMemoryIntent(input.currentUserMessage);
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
    select: { id: true, content: true, category: true, scope: true, importance: true, updatedAt: true },
  });
  const candidates = selectExtractionCandidates([input.currentUserMessage, ...priorUserMessages].join("\n"), rows);
  const { config, provider } = getMemoryAiProvider();
  const output = await collectGeneratedText(provider, {
    messages: [{
      role: "system",
      content: buildMemoryExtractorPrompt({
        currentUserMessage: input.currentUserMessage,
        assistantResponse: input.assistantResponse,
        recentTurns: input.recentTurns.slice(-8),
        explicitIntent,
        priorUserMessages,
        supportingAssistantMessages,
        persona: eligibility.conversation.personaId && input.persona?.id === eligibility.conversation.personaId ? input.persona : undefined,
        existingMemories: candidates,
      }),
    }],
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
  });
  let parsed;
  try {
    parsed = parseMemoryExtractionOutput(output);
  } catch {
    const repairedOutput = await collectGeneratedText(provider, {
      messages: [{ role: "system", content: buildMemoryJsonRepairPrompt(output) }],
      model: config.model,
      temperature: 0,
      maxOutputTokens: config.maxOutputTokens,
    });
    parsed = parseMemoryExtractionOutput(repairedOutput);
  }
  const candidateIds = new Set(candidates.map((memory) => memory.id));

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
      if (operation.action === "IGNORE" || operation.confidence < MEMORY_EXTRACTION_CONFIDENCE || !operation.content || !operation.category || !operation.scope || !operation.importance) continue;
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
        await transaction.memory.create({ data: { userId: input.userId, content: operation.content, category: operation.category, scope: operation.scope, personaId, importance: operation.importance, enabled: true, origin: "AUTO_EXTRACTED", sourceConversationId: input.conversationId, sourceMessageId: input.sourceMessageId } });
        created += 1;
      } else if (operation.action === "UPDATE" && operation.existingMemoryId && candidateIds.has(operation.existingMemoryId)) {
        if (duplicate && duplicate.id !== operation.existingMemoryId) continue;
        const result = await transaction.memory.updateMany({ where: { id: operation.existingMemoryId, userId: input.userId }, data: { content: operation.content, category: operation.category, scope: operation.scope, personaId, importance: operation.importance, origin: "AUTO_EXTRACTED", sourceConversationId: input.conversationId, sourceMessageId: input.sourceMessageId } });
        updated += result.count;
      }
    }
    return { created, updated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
