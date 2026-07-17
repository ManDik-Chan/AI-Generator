import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getImageGenerationDailyLimit } from "@/features/tools/image-generation/config";
import { toPublicToolImageError } from "@/features/tools/image-generation/errors";
import { imageGenerationRequestSchema } from "@/features/tools/image-generation/schemas";
import {
  generateToolImage,
  type ToolImageGenerationStage,
} from "@/features/tools/image-generation/service";
import {
  createPendingImageGenerationToolRun,
  DailyToolLimitError,
  finishToolRun,
  isToolRunPending,
} from "@/features/tools/usage";
import { encodeToolSse } from "@/features/tools/utils";
import {
  requireGeneratedImageStorageConfig,
  requireImageConfig,
} from "@/lib/ai/image/config";
import {
  ImageProviderError,
  logImageSafetyDiagnostic,
} from "@/lib/ai/image/errors";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { registerGenerationTask } from "@/features/generation/background-task";
import { createObservedSseResponse, SseObserver } from "@/features/generation/sse-observer";
import { createDurableCancellationController } from "@/features/generation/durable-cancellation";

export const runtime = "nodejs";
export const maxDuration = 300;

const stageLabels: Record<
  ToolImageGenerationStage,
  { label: string; detail: string }
> = {
  preparing: { label: "准备创作参数", detail: "正在验证描述、风格与服务端尺寸。" },
  generating: { label: "AI 正在生成图片", detail: "每次运行只请求一张图片。" },
  downloading: { label: "下载生成结果", detail: "正在从图片服务获取临时结果。" },
  validating: { label: "安全检查", detail: "正在验证地址、格式、大小与图片签名。" },
  uploading: { label: "保存到私有空间", detail: "正在上传到当前用户的私有 Storage。" },
  saving: { label: "保存生成记录", detail: "正在确认任务状态并创建历史记录。" },
};

const jsonError = (message: string, status: number, code: string) =>
  NextResponse.json({ message, code }, { status });

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return jsonError("请先登录后再生成图片。", 401, "AUTHENTICATION");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = imageGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "图片生成参数无效。",
      400,
      "INVALID_INPUT",
    );
  }

  let config: ReturnType<typeof requireImageConfig>;
  try {
    config = requireImageConfig();
    requireGeneratedImageStorageConfig();
  } catch {
    return jsonError("图片生成服务尚未配置，请联系管理员。", 503, "CONFIGURATION");
  }

  const dailyLimit = getImageGenerationDailyLimit();
  let usage: Awaited<ReturnType<typeof createPendingImageGenerationToolRun>>;
  try {
    usage = await createPendingImageGenerationToolRun({
      userId,
      title: `AI 图片创作：${parsed.data.prompt}`.slice(0, 100),
      inputText: parsed.data.prompt,
      options: { style: parsed.data.style, size: config.size },
      dailyLimit,
    });
  } catch (error) {
    if (error instanceof DailyToolLimitError) {
      return NextResponse.json(
        {
          message: `今日图片生成次数已用完（${error.limit} 次）。`,
          code: "DAILY_LIMIT",
          limit: error.limit,
          used: error.used,
          remaining: 0,
        },
        { status: 429 },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError("并发请求较多，请稍后重试。", 429, "RATE_LIMITED");
    }
    return jsonError("无法创建图片生成任务，请稍后重试。", 500, "UNAVAILABLE");
  }

  const observer = new SseObserver(encodeToolSse);
  observer.send("run", {
        runId: usage.runId,
        usage: {
          limit: usage.limit,
          used: usage.used,
          remaining: usage.remaining,
          unlimited: usage.unlimited,
        },
  });
  const generation = (async () => {
      const cancellation = await createDurableCancellationController({ isPending: () => isToolRunPending(userId, usage.runId), taskType: "IMAGE_GENERATE", taskId: usage.runId });
      try {
        if (cancellation.signal.aborted) { observer.send("cancelled", { runId: usage.runId }); return; }
        const image = await generateToolImage({
          userId,
          runId: usage.runId,
          prompt: parsed.data.prompt,
          style: parsed.data.style,
          signal: cancellation.signal,
          onProgress: (stage) => observer.send("progress", { stage, ...stageLabels[stage] }),
        });
        observer.send("done", {
          runId: usage.runId,
          image,
          usage: {
            limit: usage.limit,
            used: usage.used,
            remaining: usage.remaining,
            unlimited: usage.unlimited,
          },
        });
      } catch (error) {
        logImageSafetyDiagnostic(error);
        const normalized = toPublicToolImageError(error);
        const cancelled = error instanceof ImageProviderError && error.code === "ABORTED";
        await finishToolRun(
          userId,
          usage.runId,
          cancelled ? "CANCELLED" : "ERROR",
          { errorCode: cancelled ? "ABORTED" : normalized.code },
        ).catch(() => undefined);
        observer.send(cancelled ? "cancelled" : "error", {
          code: cancelled ? "ABORTED" : normalized.code,
          message: cancelled ? "图片生成已停止，没有保存半成品。" : normalized.message,
        });
      } finally {
        cancellation.dispose();
      }
  })();
  const task = registerGenerationTask(generation, { taskType: "IMAGE_GENERATE", taskId: usage.runId, userId });
  return createObservedSseResponse(observer, task, request.signal);
}
