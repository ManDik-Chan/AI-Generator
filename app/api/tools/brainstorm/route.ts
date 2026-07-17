import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { brainstormRequestSchema } from "@/features/tools/brainstorm/schemas";
import { BRAINSTORM_WORKER_VERSION } from "@/features/tools/brainstorm/constants";
import { runBrainstormService } from "@/features/tools/brainstorm/service";
import { createPendingBrainstormToolRun, DailyToolLimitError } from "@/features/tools/usage";
import { encodeToolSse } from "@/features/tools/utils";
import { registerGenerationTask } from "@/features/generation/background-task";
import { createObservedSseResponse, SseObserver } from "@/features/generation/sse-observer";
import { getBrainstormConfigurationStatus } from "@/lib/ai/config";
import { getBrainstormAiProvider } from "@/lib/ai/registry";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const jsonError = (message: string, status: number, code: string, details?: Record<string, number>) => NextResponse.json({ message, code, ...details }, { status });

export async function POST(request: Request) {
  const userId = (await (await createSupabaseServerClient()).auth.getUser()).data.user?.id;
  if (!userId) return jsonError("请先登录后再使用多 Agent 头脑风暴。", 401, "AUTHENTICATION");
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("请求格式无效。", 400, "INVALID_INPUT"); }
  const parsed = brainstormRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "头脑风暴问题无效。", 400, "INVALID_INPUT");
  if (!getBrainstormConfigurationStatus().configured) return jsonError("多 Agent 头脑风暴服务尚未配置，请联系管理员。", 503, "CONFIGURATION");

  const { config, provider } = getBrainstormAiProvider();
  let usage: Awaited<ReturnType<typeof createPendingBrainstormToolRun>>;
  try {
    const compact = parsed.data.prompt.replace(/\s+/g, " ").trim();
    usage = await createPendingBrainstormToolRun({
      userId,
      prompt: parsed.data.prompt,
      title: `多 Agent 头脑风暴：${compact}`.slice(0, 100),
      retainContent: parsed.data.saveHistory,
      dailyLimit: config.dailyLimit,
      options: { workerVersion: BRAINSTORM_WORKER_VERSION, workerModelSource: config.workerModelSource, synthesisModelSource: config.synthesisModelSource, maxConcurrency: config.maxConcurrency },
    });
  } catch (error) {
    if (error instanceof DailyToolLimitError) return jsonError(`今日头脑风暴次数已用完（${error.limit} 次）。`, 429, "DAILY_LIMIT", { limit: error.limit, used: error.used, remaining: 0 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return jsonError("并发请求较多，请稍后重试。", 429, "RATE_LIMITED");
    return jsonError("无法创建头脑风暴任务，请稍后重试。", 500, "UNKNOWN");
  }

  const observer = new SseObserver(encodeToolSse);
  observer.send("run", { runId: usage.runId, usage: { limit: usage.limit, used: usage.used, remaining: usage.remaining, unlimited: usage.unlimited } });
  const generation = runBrainstormService({
    userId,
    runId: usage.runId,
    prompt: parsed.data.prompt,
    saveHistory: parsed.data.saveHistory,
    provider,
    config,
    send: (event, data) => observer.send(event, data),
  });
  const task = registerGenerationTask(generation, { taskType: "BRAINSTORM", taskId: usage.runId, userId });
  return createObservedSseResponse(observer, task, request.signal);
}
