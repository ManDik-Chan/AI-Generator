import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";

import { getAiProvider } from "@/lib/ai/registry";
import { getAiConfigurationStatus, getAiRuntimeLimits } from "@/lib/ai/config";
import { AiProviderError, toPublicAiError } from "@/lib/ai/errors";
import { DEFAULT_ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/prompts/default-assistant";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";
import { ownedConversationWhere } from "@/features/chat/access";
import {
  assertConversationVersion,
  assertSupersedeCount,
  ChatEditConflictError,
  planLastUserMessageEdit,
  resolveEditMessageId,
} from "@/features/chat/edit";
import { finalizeAssistantMessage } from "@/features/chat/persistence";
import { createChatRequestSchema } from "@/features/chat/schemas";
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

  const profile = await prisma.profile.findUnique({ where: { id: user.id }, select: { role: true } });
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
  if (conversationId) {
    const ownedConversation = await prisma.conversation.findFirst({
      where: ownedConversationWhere(user.id, conversationId),
      select: { id: true },
    });
    if (!ownedConversation) return errorResponse("对话不存在或无权访问。", 404);
  } else {
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
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

      try {
        for await (const text of provider.streamText({
          messages: [{ role: "system", content: DEFAULT_ASSISTANT_SYSTEM_PROMPT }, ...context],
          model: config.model,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          signal: abortController.signal,
        })) {
          fullContent += text;
          controller.enqueue(encoder.encode(encodeChatSse("delta", { text })));
        }

        await finalizeAssistantMessage(assistantMessageId, fullContent, "COMPLETE");
        controller.enqueue(encoder.encode(encodeChatSse("done", { messageId: assistantMessageId })));
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
