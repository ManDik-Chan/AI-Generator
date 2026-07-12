import { NextResponse } from "next/server";
import { requireAvatarApiUser } from "@/features/persona/avatar-api";
import { generatePersonaAvatarCandidate, type PersonaAvatarGenerationStage } from "@/features/persona/avatar-service";
import { avatarGenerateSchema, personaIdSchema } from "@/features/persona/schemas";
import { logImageSafetyDiagnostic, toPublicImageError } from "@/lib/ai/image/errors";

export const runtime = "nodejs";
const encoder = new TextEncoder();
const event = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const labels: Record<PersonaAvatarGenerationStage, { label: string; detail?: string }> = {
  preparing: { label: "正在准备头像提示词" }, generating: { label: "GLM-Image 正在生成头像" }, downloading: { label: "头像已生成，正在下载图片" }, validating: { label: "正在检查图片安全性和格式" }, uploading: { label: "正在保存到私有头像存储" }, saving: { label: "正在创建头像候选记录" },
};

export async function POST(request: Request, { params }: { params: Promise<{ personaId: string }> }) {
  const user = await requireAvatarApiUser(); if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { personaId } = await params; if (!personaIdSchema.safeParse(personaId).success) return NextResponse.json({ error: "人格不存在。" }, { status: 404 });
  let body: unknown; try { body = await request.json(); } catch { body = {}; }
  const parsed = avatarGenerateSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: "头像提示词必须为 1 至 900 个字符。" }, { status: 400 });
  const stream = new ReadableStream<Uint8Array>({ async start(controller) { try { const candidate = await generatePersonaAvatarCandidate(user.id, personaId, parsed.data.prompt, request.signal, (stage) => controller.enqueue(event("progress", { stage, ...labels[stage] }))); if (!candidate) { controller.enqueue(event("error", { message: "人格不存在。" })); return; } controller.enqueue(event("done", { candidate })); } catch (error) { logImageSafetyDiagnostic(error); controller.enqueue(event("error", { message: toPublicImageError(error) })); } finally { controller.close(); } } });
  return new Response(stream, { headers: { "Cache-Control": "no-cache, no-transform", "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" } });
}
