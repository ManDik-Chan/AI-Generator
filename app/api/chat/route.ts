import { after, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";

import { getAiProvider } from "@/lib/ai/registry";
import { getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { AiProviderError, toPublicAiError } from "@/lib/ai/errors";
import { buildPersonaAssistantPrompt, type RuntimePersonaPrompt } from "@/lib/ai/prompts/persona-assistant";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";
import { ownedConversationWhere } from "@/features/chat/access";
import { activeOwnedPersonaWhere, newConversationPersonaData, personaConversationUnavailableMessage } from "@/features/persona/chat";
import {
  assertConversationVersion,
  assertSupersedeCount,
  ChatEditConflictError,
  planLastUserMessageEdit,
  resolveEditMessageId,
} from "@/features/chat/edit";
import { finalizeAssistantMessage } from "@/features/chat/persistence";
import { createChatRequestSchema } from "@/features/chat/schemas";
import { getMemoryRuntimeLimits } from "@/features/memory/constants";
import { selectRelevantMemories } from "@/features/memory/selection";
import { buildUserMemoryBlock } from "@/lib/ai/prompts/user-memory";
import { scheduleMemoryExtraction } from "@/features/memory/after";
import { extractAndPersistMemories } from "@/features/memory/extractor";
import {
  createConversationTitle,
  encodeChatSse,
  hasReachedDailyMessageLimit,
  buildCompleteTurnContext,
  startOfUtcDay,
} from "@/features/chat/utils";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function errorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  let user: User | null;
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    return errorResponse("身份验证服务暂时不可用，请稍后重试。", 503);
  }

  if (!user) return errorResponse("请先登录后再发送消息。", 401);

  const limits = getAiRuntimeLimits();
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return errorResponse("请求格式无效。", 400);
  }

  const parsed = createChatRequestSchema(limits.maxInputChars).safeParse(requestBody);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "消息内容无效。", 400);
  }

  const configuration = getAiConfigurationStatus();
  if (!configuration.configured) {
    return errorResponse("AI 服务尚未配置，请联系管理员。", 503);
  }

  const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { role: true, memoryEnabled: true } });
  const dailyCount = await prisma.message.count({
    where: {
      role: "USER",
      createdAt: { gte: startOfUtcDay() },
      conversation: { userId: user.id },
    },
  });

  if (hasReachedDailyMessageLimit(profile?.role ?? "USER", dailyCount, limits.dailyMessageLimit)) {
    return errorResponse(`今日消息次数已用完（${limits.dailyMessageLimit} 次），请在 UTC 次日重试。`, 429);
  }

  let conversationId = parsed.data.conversationId;
  let runtimePersona: RuntimePersonaPrompt | null = null;
  let runtimePersonaId: string | undefined;
  if (conversationId) {
    const ownedConversation = await prisma.conversation.findFirst({
      where: ownedConversationWhere(user.id, conversationId),
      select: { id: true, personaId: true, persona: { select: { name: true, identity: true, personality: true, speakingStyle: true, expertise: true, systemPrompt: true, archivedAt: true } } },
    });
    if (!ownedConversation) return errorResponse("对话不存在或无权访问。", 404);
    if (ownedConversation.personaId && !ownedConversation.persona) console.error("[chat] Persona relation missing", { conversationId });
    const unavailableMessage = personaConversationUnavailableMessage(ownedConversation.persona?.archivedAt);
    if (unavailableMessage) return errorResponse(unavailableMessage, 409);
    runtimePersona = ownedConversation.persona;
    runtimePersonaId = ownedConversation.personaId ?? undefined;
  } else {
    if (parsed.data.personaId) {
      const persona = await prisma.persona.findFirst({
        where: activeOwnedPersonaWhere(user.id, parsed.data.personaId),
        select: { id: true, name: true, identity: true, personality: true, speakingStyle: true, expertise: true, systemPrompt: true },
      });
      if (!persona) return errorResponse("人格不存在、已删除或无权访问。", 404);
      runtimePersona = persona;
      runtimePersonaId = persona.id;
    }
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        ...newConversationPersonaData(parsed.data.personaId),
        title: createConversationTitle(parsed.data.content),
      },
      select: { id: true },
    });
    conversationId = conversation.id;
  }

  let assistantMessageId: string;
  let userMessageId: string;
  let editedMessageId: string | undefined;
  let conversationUpdatedAt: Date;
  try {
    const result = await prisma.$transaction(async (transaction) => {
      let updateTitle = false;
      let resolvedEditMessageId = parsed.data.editMessageId;
      if (parsed.data.editMessageId || parsed.data.editLastMessage) {
        if (parsed.data.editLastMessage) {
          const currentConversation = await transaction.conversation.findUnique({
            where: { id: conversationId },
            select: { updatedAt: true },
          });
          if (!currentConversation) throw new ChatEditConflictError();
          assertConversationVersion(currentConversation.updatedAt, parsed.data.editConversationUpdatedAt!);
        }
        const activeMessages = await transaction.message.findMany({
          where: { conversationId, supersededAt: null },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, role: true, status: true, content: true, supersededAt: true },
        });
        resolvedEditMessageId = resolveEditMessageId(
          activeMessages,
          resolvedEditMessageId,
          Boolean(parsed.data.editLastMessage),
        );
        if (!resolvedEditMessageId) throw new ChatEditConflictError();
        const target = activeMessages.find((message) => message.id === resolvedEditMessageId);
        if (target?.content === parsed.data.content) throw new ChatEditConflictError("编辑内容没有变化。");
        const plan = planLastUserMessageEdit(activeMessages, resolvedEditMessageId);
        const superseded = await transaction.message.updateMany({
          where: { id: { in: plan.supersedeIds }, conversationId, supersededAt: null },
          data: { supersededAt: new Date() },
        });
        assertSupersedeCount(plan.supersedeIds.length, superseded.count);
        updateTitle = plan.updateTitle;
      }

      const userMessage = await transaction.message.create({
        data: { conversationId, role: "USER", content: parsed.data.content, status: "COMPLETE" },
        select: { id: true },
      });
      const assistantMessage = await transaction.message.create({
        data: { conversationId, role: "ASSISTANT", content: "", status: "PENDING" },
        select: { id: true },
      });
      const updatedConversation = await transaction.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date(),
          ...(updateTitle ? { title: createConversationTitle(parsed.data.content) } : {}),
        },
        select: { updatedAt: true },
      });
      return {
        assistantMessageId: assistantMessage.id,
        userMessageId: userMessage.id,
        editedMessageId: resolvedEditMessageId,
        conversationUpdatedAt: updatedConversation.updatedAt,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    assistantMessageId = result.assistantMessageId;
    userMessageId = result.userMessageId;
    editedMessageId = result.editedMessageId;
    conversationUpdatedAt = result.conversationUpdatedAt;
  } catch (error) {
    if (error instanceof ChatEditConflictError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return errorResponse(error instanceof ChatEditConflictError ? error.message : "对话内容已发生变化，请刷新后重试。", 409);
    }
    console.error("[chat] Unable to persist new messages", { conversationId, userId: user.id });
    return errorResponse("消息保存失败，请稍后重试。", 500);
  }

  let recentMessages;
  try {
    recentMessages = await prisma.message.findMany({
      where: {
        conversationId,
        supersededAt: null,
        role: { in: ["USER", "ASSISTANT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, role: true, status: true, content: true, createdAt: true, supersededAt: true },
    });
  } catch {
    await finalizeAssistantMessage(assistantMessageId, "", "ERROR");
    console.error("[chat] Unable to load conversation context", { conversationId, userId: user.id });
    return errorResponse("对话上下文读取失败，请稍后重试。", 500);
  }
  const context = buildCompleteTurnContext(recentMessages, userMessageId);
  let selectedMemories: Array<{ id: string; content: string }> = [];
  if (profile?.memoryEnabled ?? true) {
    try {
      const candidates = await prisma.memory.findMany({ where: { userId: user.id, enabled: true, OR: [{ scope: "GLOBAL" }, ...(runtimePersonaId ? [{ scope: "PERSONA" as const, personaId: runtimePersonaId }] : [])] }, select: { id: true, content: true, category: true, scope: true, personaId: true, importance: true, enabled: true, updatedAt: true, topicKey: true, keywords: true, pinned: true, useCount: true, lastUsedAt: true } });
      selectedMemories = selectRelevantMemories({ currentMessage: parsed.data.content, recentUserMessages: context.filter((message) => message.role === "user").slice(-6).map((message) => message.content), personaId: runtimePersonaId, candidates, ...getMemoryRuntimeLimits() });
    } catch { console.warn("memory_load_failed", { userId: user.id, conversationId }); }
  }
  const systemContent = buildPersonaAssistantPrompt(runtimePersona) + buildUserMemoryBlock(selectedMemories);
  const { config, provider } = getAiProvider();
  const abortController = new AbortController();
  const abortFromRequest = () => abortController.abort();
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  if (request.signal.aborted) abortController.abort();
  let fullContent = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(encodeChatSse("conversation", {
        conversationId,
        updatedAt: conversationUpdatedAt.toISOString(),
      })));
      controller.enqueue(encoder.encode(encodeChatSse("turn", {
        conversationId,
        userMessageId,
        assistantMessageId,
        ...(editedMessageId ? { editedMessageId } : {}),
      })));
      if (selectedMemories.length) controller.enqueue(encoder.encode(encodeChatSse("memory", { count: selectedMemories.length })));

      try {
        for await (const text of provider.streamText({
          messages: [{ role: "system", content: systemContent }, ...context],
          model: config.model,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          signal: abortController.signal,
        })) {
          fullContent += text;
          controller.enqueue(encoder.encode(encodeChatSse("delta", { text })));
        }

        const finalized = await finalizeAssistantMessage(assistantMessageId, fullContent, "COMPLETE");
        if (finalized && selectedMemories.length) { try { await prisma.memory.updateMany({ where: { userId: user.id, id: { in: selectedMemories.map((memory) => memory.id) } }, data: { lastUsedAt: new Date(), useCount: { increment: 1 } } }); } catch { console.warn("memory_last_used_update_failed", { userId: user.id, conversationId, count: selectedMemories.length }); } }
        controller.enqueue(encoder.encode(encodeChatSse("done", { messageId: assistantMessageId })));
        if (finalized && (profile?.memoryEnabled ?? true)) {
          const recentTurns = context
            .slice(0, -1)
            .filter((message): message is { role: "user" | "assistant"; content: string } => message.role !== "system")
            .slice(-8);
          scheduleMemoryExtraction(after, () => extractAndPersistMemories({
            userId: user.id,
            conversationId,
            sourceMessageId: userMessageId,
            assistantMessageId,
            currentUserMessage: parsed.data.content,
            assistantResponse: fullContent,
            recentTurns,
            persona: runtimePersonaId && runtimePersona ? { id: runtimePersonaId, name: runtimePersona.name } : undefined,
          }).then(() => undefined), { requestId, userId: user.id, conversationId, sourceMessageId: userMessageId });
        }
      } catch (error) {
        const stopped = error instanceof AiProviderError && error.code === "ABORTED";
        await finalizeAssistantMessage(
          assistantMessageId,
          fullContent,
          stopped && fullContent ? "COMPLETE" : "ERROR",
        );

        if (!stopped) {
          console.error("[chat] Provider request failed", {
            code: error instanceof AiProviderError ? error.code : "UNKNOWN",
            status: error instanceof AiProviderError ? error.status : undefined,
          });
          controller.enqueue(encoder.encode(encodeChatSse("error", { message: toPublicAiError(error) })));
        }
      } finally {
        request.signal.removeEventListener("abort", abortFromRequest);
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    },
  });
}
