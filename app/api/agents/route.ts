import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { AgentCreationError, createPendingAgentRun } from "@/features/agents/creation";
import { agentRequestSchema } from "@/features/agents/schemas";
import { runAgentService } from "@/features/agents/service";
import { encodeAgentSse } from "@/features/agents/sse";
import { registerGenerationTask } from "@/features/generation/background-task";
import { createObservedSseResponse, SseObserver } from "@/features/generation/sse-observer";
import { getAgentConfigurationStatus } from "@/lib/ai/config";
import { getAgentAiProvider } from "@/lib/ai/registry";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const jsonError = (message: string, status: number, code: string, details?: Record<string, number>) => NextResponse.json({ message, code, ...details }, { status });

export async function POST(request: Request) {
  let userId: string | undefined;
  try {
    userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  } catch {
    return jsonError("身份验证服务暂时不可用，请稍后重试。", 503, "AUTH_UNAVAILABLE");
  }
  if (!userId) return jsonError("请先登录后再使用 Agent Mode。", 401, "AUTHENTICATION");

  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError("请求格式无效。", 400, "INVALID_INPUT"); }
  const parsed = agentRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Agent 请求无效。", 400, "INVALID_INPUT");
  if (!getAgentConfigurationStatus().configured) return jsonError("Agent 服务尚未配置，请联系管理员。", 503, "CONFIGURATION");

  const { config, provider } = getAgentAiProvider();
  let created: Awaited<ReturnType<typeof createPendingAgentRun>>;
  try {
    created = await createPendingAgentRun({ userId, ...parsed.data, dailyCredits: config.dailyCredits });
  } catch (error) {
    if (error instanceof AgentCreationError) {
      const status = error.code === "DAILY_CREDITS" ? 429 : error.code === "CONVERSATION_NOT_FOUND" || error.code === "PERSONA_NOT_FOUND" ? 404 : 409;
      return jsonError(error.message, status, error.code, error.details);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError("并发请求较多，请稍后重试。", 429, "RATE_LIMITED");
    }
    console.error("agent_run_creation_failed", { userId, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return jsonError("无法创建 Agent 运行，请稍后重试。", 500, "UNKNOWN");
  }

  const observer = new SseObserver(encodeAgentSse);
  observer.send("run", {
    runId: created.runId,
    conversationId: created.conversationId,
    conversationUpdatedAt: created.conversationUpdatedAt.toISOString(),
    userMessageId: created.userMessageId,
    assistantMessageId: created.assistantMessageId,
    startedAt: created.startedAt.toISOString(),
    mode: parsed.data.mode,
    usage: created.usage,
  });
  const generation = runAgentService({
    userId,
    runId: created.runId,
    provider,
    config,
    send: (event, data) => observer.send(event, data),
  });
  const task = registerGenerationTask(generation, { taskType: "AGENT", taskId: created.runId, userId });
  return createObservedSseResponse(observer, task, request.signal);
}
