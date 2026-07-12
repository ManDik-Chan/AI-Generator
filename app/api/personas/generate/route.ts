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

export async function POST(request: Request) {
  let user;
  try { user = (await (await createSupabaseServerClient()).auth.getUser()).data.user; }
  catch { return NextResponse.json({ message: "身份验证服务暂时不可用，请稍后重试。" }, { status: 503 }); }
  if (!user) return NextResponse.json({ message: "请先登录后再生成人格。" }, { status: 401 });
  if (!getAiConfigurationStatus().configured) return NextResponse.json({ message: "AI 人格生成服务尚未配置，你仍可手动创建。" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "请求格式无效。" }, { status: 400 }); }
  const parsed = personaDescriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "人格描述无效。" }, { status: 400 });

  const requestId = crypto.randomUUID();
  try {
    const { config, provider } = getPersonaAiProvider();
    const draft = await generatePersonaDraftWithRepair(async (repair) => collectGeneratedText(provider, {
      model: config.model, temperature: config.temperature, maxOutputTokens: config.maxOutputTokens, signal: request.signal,
      messages: repair ? [
        { role: "system", content: buildPersonaGeneratorPrompt(PERSONA_AVATAR_PRESETS) },
        { role: "user", content: buildPersonaRepairPrompt(repair.error, repair.raw) },
      ] : [
        { role: "system", content: buildPersonaGeneratorPrompt(PERSONA_AVATAR_PRESETS) },
        { role: "user", content: wrapPersonaRequest(parsed.data.description) },
      ],
    }));
    console.info("[persona.generate] completed", { requestId, userId: user.id, provider: "openai-compatible", model: config.model });
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[persona.generate] failed", { requestId, userId: user.id, code: error instanceof AiProviderError ? error.code : "INVALID_DRAFT" });
    const status = error instanceof AiProviderError && error.code === "RATE_LIMITED" ? 429 : error instanceof AiProviderError && error.code === "ABORTED" ? 499 : 502;
    return NextResponse.json({ message: error instanceof AiProviderError ? toPublicAiError(error) : error instanceof Error ? error.message : "AI 返回的人格格式不完整，请重新生成。" }, { status });
  }
}
