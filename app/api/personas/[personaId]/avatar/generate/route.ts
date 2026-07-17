import { NextResponse } from "next/server";
import { requireAvatarApiUser } from "@/features/persona/avatar-api";
import { deleteGeneratedAvatar, generatePersonaAvatarCandidate, type PersonaAvatarGenerationStage } from "@/features/persona/avatar-service";
import { avatarGenerateSchema, personaIdSchema } from "@/features/persona/schemas";
import { logImageSafetyDiagnostic, toPublicImageError } from "@/lib/ai/image/errors";
import { createGenerationRun, finishGenerationRun, isGenerationRunPending } from "@/features/generation/runs";
import { registerGenerationTask } from "@/features/generation/background-task";
import { createObservedSseResponse, SseObserver } from "@/features/generation/sse-observer";
import { createDurableCancellationController } from "@/features/generation/durable-cancellation";

export const runtime = "nodejs";
export const maxDuration = 300;
const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const labels: Record<PersonaAvatarGenerationStage, { label: string; detail?: string }> = {
  preparing: { label: "正在准备头像提示词" }, generating: { label: "GLM-Image 正在生成头像" }, downloading: { label: "头像已生成，正在下载图片" }, validating: { label: "正在检查图片安全性和格式" }, uploading: { label: "正在保存到私有头像存储" }, saving: { label: "正在创建头像候选记录" },
};

export async function POST(request: Request, { params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) return NextResponse.json({ error: "人格不存在。" }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { body = {}; }
  const parsed = avatarGenerateSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "头像提示词必须为 1 至 900 个字符。" }, { status: 400 });
  const run = await createGenerationRun({ userId: user.id, personaId, type: "PERSONA_AVATAR", input: { prompt: parsed.data.prompt } });
  const observer = new SseObserver(event);
  observer.send("run", { runId: run.id });
  const generation = (async () => {
    const cancellation = await createDurableCancellationController({ isPending: () => isGenerationRunPending(user.id, run.id), taskType: "PERSONA_AVATAR", taskId: run.id });
    try {
      if (cancellation.signal.aborted) { observer.send("cancelled", { runId: run.id }); return; }
      const candidate = await generatePersonaAvatarCandidate(user.id, personaId, parsed.data.prompt, cancellation.signal, (stage) => observer.send("progress", { stage, ...labels[stage] }));
      if (!candidate) {
        await finishGenerationRun(user.id, run.id, "ERROR", { errorCode: "NOT_FOUND" });
        observer.send("error", { message: "人格不存在。" });
        return;
      }
      const completed = await finishGenerationRun(user.id, run.id, "COMPLETE", { result: { candidate } });
      if (!completed.count) {
        await deleteGeneratedAvatar(user.id, candidate.generatedImageId).catch(() => undefined);
        observer.send("cancelled", { runId: run.id });
        return;
      }
      observer.send("done", { runId: run.id, candidate });
    } catch (error) {
      logImageSafetyDiagnostic(error);
      const failed = await finishGenerationRun(user.id, run.id, "ERROR", { errorCode: "IMAGE_PROVIDER" }).catch(() => ({ count: 0 }));
      observer.send(failed.count ? "error" : "cancelled", failed.count ? { message: toPublicImageError(error) } : { runId: run.id });
    } finally {
      cancellation.dispose();
    }
  })();
  const task = registerGenerationTask(generation, { taskType: "PERSONA_AVATAR", taskId: run.id, userId: user.id });
  return createObservedSseResponse(observer, task, request.signal);
}
