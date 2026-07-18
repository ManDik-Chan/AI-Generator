import "server-only";

import { getMemoryRuntimeLimits } from "@/features/memory/constants";
import { selectRelevantMemories } from "@/features/memory/selection";
import { prisma } from "@/lib/database/prisma";

function compact(value: string | null | undefined, maximum: number) {
  return value?.replace(/\s+/g, " ").trim().slice(0, maximum) || undefined;
}

export async function loadAgentRuntimeContext(userId: string, runId: string) {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId, status: "PENDING" },
    select: {
      id: true,
      mode: true,
      conversationId: true,
      userMessageId: true,
      userMessage: { select: { content: true } },
      conversation: {
        select: {
          personaId: true,
          persona: {
            select: { name: true, identity: true, personality: true, speakingStyle: true, expertise: true },
          },
        },
      },
      user: { select: { memoryEnabled: true } },
    },
  });
  if (!run) return null;

  const messages = await prisma.message.findMany({
    where: {
      conversationId: run.conversationId,
      supersededAt: null,
      status: "COMPLETE",
      role: { in: ["USER", "ASSISTANT"] },
      id: { not: run.userMessageId },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 12,
    select: { role: true, content: true },
  });
  const conversationSummary = compact(
    messages.reverse().map((message) => `${message.role === "USER" ? "User" : "Assistant"}: ${compact(message.content, 600)}`).join("\n"),
    4_000,
  );
  const persona = run.conversation.persona;
  const personaSummary = persona ? compact([
    `Name: ${persona.name}`,
    persona.identity && `Identity: ${persona.identity}`,
    `Personality: ${persona.personality}`,
    persona.speakingStyle && `Speaking style: ${persona.speakingStyle}`,
    persona.expertise && `Expertise: ${persona.expertise}`,
  ].filter(Boolean).join("\n"), 1_200) : undefined;

  let selectedMemoryIds: string[] = [];
  let memorySummary: string | undefined;
  if (run.user.memoryEnabled) {
    const candidates = await prisma.memory.findMany({
      where: {
        userId,
        enabled: true,
        OR: [
          { scope: "GLOBAL" },
          ...(run.conversation.personaId ? [{ scope: "PERSONA" as const, personaId: run.conversation.personaId }] : []),
        ],
      },
      select: {
        id: true, content: true, category: true, scope: true, personaId: true, importance: true,
        enabled: true, updatedAt: true, topicKey: true, keywords: true, pinned: true, useCount: true, lastUsedAt: true,
      },
    });
    const limits = getMemoryRuntimeLimits();
    const selected = selectRelevantMemories({
      currentMessage: run.userMessage.content,
      recentUserMessages: messages.filter((message) => message.role === "USER").slice(-6).map((message) => message.content),
      personaId: run.conversation.personaId ?? undefined,
      candidates,
      ...limits,
    });
    selectedMemoryIds = selected.map((memory) => memory.id);
    memorySummary = compact(selected.map((memory) => `- ${memory.content}`).join("\n"), limits.maxChars);
  }

  return {
    userProblem: run.userMessage.content.slice(0, 8_000),
    mode: run.mode,
    conversationId: run.conversationId,
    userMessageId: run.userMessageId,
    conversationSummary,
    personaSummary,
    memorySummary,
    selectedMemoryIds,
  };
}
