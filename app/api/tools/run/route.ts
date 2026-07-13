import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { toolRunRequestSchema } from "@/features/tools/schemas";
import { createPendingToolRun, DailyToolLimitError, finishToolRun } from "@/features/tools/usage";
import { buildToolPrompt } from "@/features/tools/prompts";
import { createToolRunTitle, encodeToolSse, publicToolError, toolErrorCode } from "@/features/tools/utils";
import { TOOL_OUTPUT_MAX_CHARS } from "@/features/tools/constants";
import { ToolOutputGuard, UnsafeToolOutputError } from "@/features/tools/output-guard";
import { getAiConfigurationStatus } from "@/lib/ai/config";
import { AiProviderError } from "@/lib/ai/errors";
import { getToolAiProvider } from "@/lib/ai/registry";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const jsonError = (message: string, status: number, code: string, details?: Record<string, number>) => NextResponse.json({ code, message, ...details }, { status });

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  const startedAt = Date.now();
  let userId: string;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return jsonError("请先登录后再使用 AI 工具。", 401, "AUTHENTICATION");
    userId = data.user.id;
  } catch {
    return jsonError("身份验证服务暂时不可用，请稍后重试。", 503, "UNKNOWN");
  }

  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("请求格式无效。", 400, "INVALID_INPUT"); }
  const parsed = toolRunRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "工具输入无效。", 400, "INVALID_INPUT");

  if (!getAiConfigurationStatus().configured) return jsonError("AI 工具服务尚未配置，请联系管理员。", 503, "CONFIGURATION");
  const { config, provider } = getToolAiProvider();
  let usage: Awaited<ReturnType<typeof createPendingToolRun>>;
  try {
    usage = await createPendingToolRun({
      userId,
      tool: parsed.data.tool,
      title: createToolRunTitle(parsed.data.tool, parsed.data.input),
      inputText: parsed.data.input,
      options: parsed.data.options,
      retainContent: parsed.data.saveHistory,
      dailyLimit: config.dailyLimit,
    });
  } catch (error) {
    if (error instanceof DailyToolLimitError) return jsonError(`今日工具次数已用完（${error.limit} 次），请在 UTC 次日重试。`, 429, "DAILY_LIMIT", { limit: error.limit, used: error.used, remaining: 0 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return jsonError("并发请求较多，请稍后重试。", 429, "RATE_LIMITED", { limit: config.dailyLimit, used: config.dailyLimit, remaining: 0 });
    console.error("tool_run_create_failed", { requestId, userId, toolType: parsed.data.tool, stage: "persist", errorCode: "UNKNOWN", status: 500, durationMs: Date.now() - startedAt });
    return jsonError("工具运行记录创建失败，请稍后重试。", 500, "UNKNOWN");
  }

  const abortController = new AbortController();
  const abortFromRequest = () => abortController.abort();
  request.signal.addEventListener("abort", abortFromRequest, { once: true });
  if (request.signal.aborted) abortController.abort();
  const prompt = buildToolPrompt(parsed.data);
  let output = "";
  const outputGuard = new ToolOutputGuard();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(encodeToolSse(event, data))); return true; } catch { abortController.abort(); return false; }
      };
      send("start", { runId: usage.runId, tool: parsed.data.tool, limit: usage.limit, used: usage.used, remaining: usage.remaining });
      try {
        for await (const text of provider.streamText({
          messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
          model: config.model,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          thinking: "disabled",
          signal: abortController.signal,
        })) {
          if (output.length + text.length > TOOL_OUTPUT_MAX_CHARS) throw new AiProviderError("INVALID_RESPONSE", "Tool output exceeded the safe storage limit.");
          output += text;
          const safeText = outputGuard.push(text);
          if (safeText && !send("delta", { text: safeText })) break;
        }
        const finalSafeText = outputGuard.flush();
        if (finalSafeText) send("delta", { text: finalSafeText });
        const completed = await finishToolRun(userId, usage.runId, "COMPLETE", { outputText: parsed.data.saveHistory ? output : undefined });
        if (completed.count) send("done", { runId: usage.runId, status: "COMPLETE", saved: parsed.data.saveHistory });
      } catch (error) {
        const normalized = publicToolError(error);
        if (error instanceof UnsafeToolOutputError) abortController.abort();
        const cancelled = abortController.signal.aborted || normalized.code === "CANCELLED";
        const unsafe = error instanceof UnsafeToolOutputError;
        await finishToolRun(userId, usage.runId, unsafe ? "ERROR" : cancelled ? "CANCELLED" : "ERROR", { errorCode: unsafe ? "UNSAFE_OUTPUT" : cancelled ? "CANCELLED" : normalized.code }).catch(() => undefined);
        console.error("tool_run_failed", { requestId, userId, runId: usage.runId, toolType: parsed.data.tool, stage: unsafe ? "output_guard" : "provider_request", errorCode: unsafe ? "UNSAFE_OUTPUT" : toolErrorCode(error), status: error instanceof AiProviderError ? error.status : undefined, durationMs: Date.now() - startedAt });
        send("error", { code: unsafe ? "UNSAFE_OUTPUT" : cancelled ? "CANCELLED" : normalized.code, message: unsafe ? "AI 返回内容未通过安全检查，请重试或联系管理员。" : cancelled ? "已停止生成。" : normalized.message });
      } finally {
        request.signal.removeEventListener("abort", abortFromRequest);
        try { controller.close(); } catch { /* disconnected clients are already closed */ }
      }
    },
    cancel() { abortController.abort(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
