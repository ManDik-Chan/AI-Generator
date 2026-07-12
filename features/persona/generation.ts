import { z } from "zod";
import { PERSONA_AVATAR_PRESETS, PERSONA_LIMITS, resolveAvatarPreset } from "@/features/persona/constants";

const clean = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const optional = (max: number) => z.string().transform(clean).pipe(z.string().max(max)).optional();

export const personaDescriptionSchema = z.object({ description: z.string().transform(clean).pipe(z.string().min(10, "请至少输入 10 个字符。").max(1500, "描述不能超过 1500 个字符。")) });
export const generatedPersonaSchema = z.object({
  name: z.string().transform(clean).pipe(z.string().min(1).max(PERSONA_LIMITS.name)),
  description: optional(PERSONA_LIMITS.description), identity: optional(PERSONA_LIMITS.identity),
  personality: z.string().transform(clean).pipe(z.string().min(1).max(PERSONA_LIMITS.personality)),
  speakingStyle: optional(PERSONA_LIMITS.speakingStyle), expertise: optional(PERSONA_LIMITS.expertise), greeting: optional(PERSONA_LIMITS.greeting),
  avatarPresetId: z.string().max(80).optional(),
  avatarPrompt: z.string().transform(clean).pipe(z.string().min(1).max(1200)).refine((value) => !/(?:https?:|javascript:|data:|openai|glm|智谱|api[_ -]?key|\b\d{2,4}x\d{2,4}\b)/i.test(value), "avatarPrompt 包含不允许的供应商、URL 或 API 参数。"),
}).strip();

export type GeneratedPersonaModelDraft = z.infer<typeof generatedPersonaSchema>;
export interface PersonaAvatarPlan { prompt: string; personaName: string; suggestedPresetId?: string }

export function buildPersonaAvatarPlan(draft: GeneratedPersonaModelDraft): PersonaAvatarPlan {
  return { prompt: draft.avatarPrompt, personaName: draft.name, suggestedPresetId: draft.avatarPresetId };
}

export function extractFirstJsonObject(output: string) {
  const text = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (start < 0) { if (char === "{") { start = i; depth = 1; } continue; }
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true; else if (char === "{") depth += 1; else if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("未找到完整 JSON 对象");
}

export function parseGeneratedPersona(output: string) {
  if (!output.trim()) throw new Error("AI 返回空内容");
  return generatedPersonaSchema.parse(JSON.parse(extractFirstJsonObject(output)));
}

export function toClientPersonaDraft(model: GeneratedPersonaModelDraft) {
  const preset = resolveAvatarPreset(PERSONA_AVATAR_PRESETS.some((item) => item.id === model.avatarPresetId) ? model.avatarPresetId : undefined, `${model.name}${model.personality}`);
  const fields = { name: model.name, description: model.description, identity: model.identity, personality: model.personality, speakingStyle: model.speakingStyle, expertise: model.expertise, greeting: model.greeting, avatarUrl: preset.src };
  return { ...fields, avatarPrompt: model.avatarPrompt, avatarPresetId: preset.id };
}
