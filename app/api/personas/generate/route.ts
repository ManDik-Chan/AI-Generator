import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { getAiConfigurationStatus } from "@/lib/ai/config";
import { getPersonaAiProvider } from "@/lib/ai/registry";
import { collectGeneratedText } from "@/lib/ai/collect-text";
import { AiProviderError, toPublicAiError } from "@/lib/ai/errors";
import { buildPersonaGeneratorPrompt, buildPersonaRepairPrompt, wrapPersonaRequest } from "@/lib/ai/prompts/persona-generator";
import { PERSONA_AVATAR_PRESETS } from "@/features/persona/constants";
import { personaDescriptionSchema } from "@/features/persona/generation";
import { generatePersonaDraftWithRepair } from "@/features/persona/generate-draft";

export const runtime = "nodejs";
const encoder = new TextEncoder();
const event = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  let user;
  try { user = (await (await createSupabaseServerClient()).auth.getUser()).data.user; }
  catch { return NextResponse.json({ message: "身份验证服务暂时不可用，请稍后重试。" }, { status: 503 }); }
  if (!user) return NextResponse.json({ message: "请先登录后再生成人格。" }, { status: 401 });
  if (!getAiConfigurationStatus().configured) return NextResponse.json({ message: "AI 人格生成服务尚未配置，你仍可手动创建。" }, { status: 503 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "请求格式无效。" }, { status: 400 }); }
  const parsed = personaDescriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "人格描述无效。" }, { status: 400 });

  const requestId = crypto.randomUUID(); const userId = user.id;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const progress = (stage: string, label: string, detail?: string) => controller.enqueue(event("progress", { stage, label, ...(detail ? { detail } : {}) }));
      try {
        progress("preparing", "正在整理人格需求");
        const { config, provider } = getPersonaAiProvider();
        progress("generating", "AI 正在生成人格设定", "正在生成身份、性格、表达方式和开场白");
        const draft = await generatePersonaDraftWithRepair(async (repair) => collectGeneratedText(provider, {
          model: config.model, temperature: config.temperature, maxOutputTokens: config.maxOutputTokens, signal: request.signal,
          messages: repair ? [{ role: "system", content: buildPersonaGeneratorPrompt(PERSONA_AVATAR_PRESETS) }, { role: "user", content: buildPersonaRepairPrompt(repair.error, repair.raw) }] : [{ role: "system", content: buildPersonaGeneratorPrompt(PERSONA_AVATAR_PRESETS) }, { role: "user", content: wrapPersonaRequest(parsed.data.description) }],
        }), (stage) => stage === "repairing" ? progress("repairing", "正在修复 AI 返回格式") : progress("validating", "正在检查人格结构", "校验字段、头像建议和输出格式"));
        progress("drafting", "正在准备可编辑草稿");
        controller.enqueue(event("done", { draft }));
        console.info("[persona.generate] completed", { requestId, userId, provider: "openai-compatible", model: config.model });
      } catch (error) {
        if (!(error instanceof AiProviderError && error.code === "ABORTED")) console.error("[persona.generate] failed", { requestId, userId, code: error instanceof AiProviderError ? error.code : "INVALID_DRAFT" });
        const message = error instanceof AiProviderError ? toPublicAiError(error) : error instanceof Error ? error.message : "AI 返回的人格格式不完整，请重新生成。";
        controller.enqueue(event("error", { message }));
      } finally { controller.close(); }
    },
    cancel() { /* request.signal aborts provider work when the client disconnects */ },
  });
  return new Response(stream, { headers: { "Cache-Control": "no-cache, no-transform", "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" } });
}
