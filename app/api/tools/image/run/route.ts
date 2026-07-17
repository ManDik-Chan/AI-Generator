import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { cleanupToolRunAssets } from "@/features/tools/image/assets";
import { buildImageAnalysisPrompt } from "@/features/tools/image/prompt";
import { processUploadedImage, UnsafeUploadError } from "@/features/tools/image/processor";
import { imageRunFieldsSchema } from "@/features/tools/image/schemas";
import { buildToolAssetPath, downloadToolAsset, removeToolAssets, uploadToolAsset } from "@/features/tools/image/storage";
import { TOOL_OUTPUT_MAX_CHARS } from "@/features/tools/constants";
import { ToolOutputGuard } from "@/features/tools/output-guard";
import { createPendingVisionToolRun, DailyToolLimitError, finishRecoverableToolRun, finishToolRun, isToolRunPending, persistToolRunPartial } from "@/features/tools/usage";
import { encodeToolSse, publicToolError } from "@/features/tools/utils";
import { AiProviderError } from "@/lib/ai/errors";
import { getToolAssetConfig } from "@/lib/ai/vision/config";
import { getVisionProvider } from "@/lib/ai/vision/registry";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { prisma } from "@/lib/database/prisma";
import { registerGenerationTask } from "@/features/generation/background-task";
import { createObservedSseResponse, SseObserver } from "@/features/generation/sse-observer";
import { createDurableCancellationController } from "@/features/generation/durable-cancellation";

export const runtime = "nodejs";
export const maxDuration = 300;
const jsonError = (message: string, status: number, code: string, details?: Record<string, number>) => NextResponse.json({ message, code, ...details }, { status });

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient(); const { data } = await supabase.auth.getUser();
  if (!data.user) return jsonError("请先登录后再分析图片。", 401, "AUTHENTICATION");
  const userId = data.user.id;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 11 * 1024 * 1024) return jsonError("图片不能超过 10 MB。", 413, "TOO_LARGE");
  let form: FormData; try { form = await request.formData(); } catch { return jsonError("上传请求格式无效。", 400, "INVALID_INPUT"); }
  const parsed = imageRunFieldsSchema.safeParse({ question: form.get("question") ?? "", saveHistory: form.get("saveHistory"), options: form.get("options"), sourceAssetId: form.get("sourceAssetId") || undefined });
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "图片分析选项无效。", 400, "INVALID_INPUT");

  const upload = form.get("image");
  let sourceFile: File;
  if (upload instanceof File && upload.size) sourceFile = upload;
  else if (parsed.data.sourceAssetId) {
    const source = await prisma.toolAsset.findFirst({ where: { id: parsed.data.sourceAssetId, userId, expiresAt: { gt: new Date() } }, select: { storagePath: true, mimeType: true } });
    if (!source) return jsonError("原图片已到期或不可用，请重新选择图片。", 410, "ASSET_EXPIRED");
    try { const bytes = await downloadToolAsset(source.storagePath); sourceFile = new File([bytes], "restored-image", { type: source.mimeType }); }
    catch { return jsonError("暂时无法读取原图片，请重新上传。", 503, "STORAGE"); }
  } else return jsonError("请选择一张图片。", 400, "EMPTY_FILE");

  let image: Awaited<ReturnType<typeof processUploadedImage>>;
  try { image = await processUploadedImage(sourceFile); }
  catch (error) { if (error instanceof UnsafeUploadError) return jsonError(error.message, error.code === "TOO_LARGE" ? 413 : 400, error.code); return jsonError("图片安全校验失败。", 400, "UNSAFE_IMAGE"); }

  let config: ReturnType<typeof getVisionProvider>["config"]; let provider: ReturnType<typeof getVisionProvider>["provider"];
  try { ({ config, provider } = getVisionProvider()); getToolAssetConfig(); }
  catch { return jsonError("图片分析服务尚未配置，请联系管理员。", 503, "CONFIGURATION"); }

  let usage: Awaited<ReturnType<typeof createPendingVisionToolRun>>;
  try { usage = await createPendingVisionToolRun({ userId, title: `图片分析${parsed.data.question ? `：${parsed.data.question}` : ""}`.slice(0,100), inputText: parsed.data.question || "图片分析", options: parsed.data.options, retainContent: parsed.data.saveHistory, dailyLimit: config.dailyLimit }); }
  catch (error) {
    if (error instanceof DailyToolLimitError) return jsonError(`今日图片分析次数已用完（${error.limit} 次）。`, 429, "DAILY_LIMIT", { limit: error.limit, used: error.used, remaining: 0 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return jsonError("并发请求较多，请稍后重试。", 429, "RATE_LIMITED");
    return jsonError("无法创建图片分析任务，请稍后重试。", 500, "UNKNOWN");
  }

  const path = buildToolAssetPath(userId, usage.runId, image.extension); let uploaded = false;
  try {
    await uploadToolAsset(path, image.bytes, image.mimeType); uploaded = true;
    const { retentionDays } = getToolAssetConfig();
    await prisma.toolAsset.create({ data: { userId, toolRunId: usage.runId, storagePath: path, mimeType: image.mimeType, sizeBytes: image.sizeBytes, width: image.width, height: image.height, sha256: image.sha256, expiresAt: new Date(Date.now() + retentionDays * 86_400_000) } });
  } catch {
    if (uploaded) await removeToolAssets([path]).catch(() => console.error("tool_asset_compensation_failed", { userId, runId: usage.runId }));
    await finishToolRun(userId, usage.runId, "ERROR", { errorCode: "STORAGE" }).catch(() => undefined);
    return jsonError("图片暂时无法安全保存，请稍后重试。", 503, "STORAGE");
  }

  const prompt = buildImageAnalysisPrompt(parsed.data.options, parsed.data.question);
  const observer = new SseObserver(encodeToolSse);
  observer.send("start", { runId: usage.runId, tool: "IMAGE_ANALYZE", limit: usage.limit, used: usage.used, remaining: usage.remaining, unlimited: usage.unlimited });
  const generation = (async () => {
    let output = ""; let persistedLength = 0; let lastPersistedAt = Date.now(); const guard = new ToolOutputGuard();
    const cancellation = await createDurableCancellationController({ isPending: () => isToolRunPending(userId, usage.runId), taskType: "IMAGE_ANALYZE", taskId: usage.runId });
    try {
      if (cancellation.signal.aborted) { observer.send("cancelled", { runId: usage.runId, status: "CANCELLED" }); return; }
      for await (const delta of provider.streamImageAnalysis({ system: prompt.system, question: prompt.user, image: image.bytes, mimeType: image.mimeType, signal: cancellation.signal })) {
        if (output.length + delta.length > TOOL_OUTPUT_MAX_CHARS) throw new AiProviderError("INVALID_RESPONSE", "Vision output too large");
        output += delta; const safe = guard.push(delta); if (safe) observer.send("delta", { text: safe });
        if (Date.now() - lastPersistedAt >= 750 || output.length - persistedLength >= 1024) {
          const persisted = await persistToolRunPartial(userId, usage.runId, output);
          if (!persisted.count) { observer.send("cancelled", { runId: usage.runId, status: "CANCELLED" }); return; }
          lastPersistedAt = Date.now(); persistedLength = output.length;
        }
      }
      const final = guard.flush(); if (final) observer.send("delta", { text: final });
      const completed = await finishRecoverableToolRun(userId, usage.runId, "COMPLETE", { outputText: output });
      if (!parsed.data.saveHistory) await cleanupToolRunAssets(userId, usage.runId);
      if (completed.count) observer.send("done", { runId: usage.runId, status: "COMPLETE", saved: parsed.data.saveHistory });
      else observer.send("cancelled", { runId: usage.runId, status: "CANCELLED" });
    } catch (error) {
      const normalized = publicToolError(error);
      const failed = await finishRecoverableToolRun(userId, usage.runId, "ERROR", { outputText: output, errorCode: normalized.code }).catch(() => ({ count: 0 }));
      if (!parsed.data.saveHistory) await cleanupToolRunAssets(userId, usage.runId);
      observer.send(failed.count ? "error" : "cancelled", failed.count ? { code: normalized.code, message: normalized.message } : { runId: usage.runId, status: "CANCELLED" });
    } finally {
      cancellation.dispose();
    }
  })();
  const task = registerGenerationTask(generation, { taskType: "IMAGE_ANALYZE", taskId: usage.runId, userId });
  return createObservedSseResponse(observer, task, request.signal);
}
