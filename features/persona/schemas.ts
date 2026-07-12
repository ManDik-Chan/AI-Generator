import { z } from "zod";
import { PERSONA_AVATARS, PERSONA_LIMITS } from "@/features/persona/constants";

const optionalText = (limit: number) => z.string().trim().max(limit, `不能超过 ${limit} 个字符。`).optional().transform((value) => value || undefined);

export const personaInputSchema = z.object({
  name: z.string().trim().min(1, "请输入人格名称。").max(PERSONA_LIMITS.name, `名称不能超过 ${PERSONA_LIMITS.name} 个字符。`),
  avatarUrl: z.enum(PERSONA_AVATARS as [string, ...string[]], { error: "请选择有效的预设头像。" }).optional(),
  description: optionalText(PERSONA_LIMITS.description),
  identity: optionalText(PERSONA_LIMITS.identity),
  personality: z.string().trim().min(1, "请输入人格性格。").max(PERSONA_LIMITS.personality, `性格不能超过 ${PERSONA_LIMITS.personality} 个字符。`),
  speakingStyle: optionalText(PERSONA_LIMITS.speakingStyle),
  expertise: optionalText(PERSONA_LIMITS.expertise),
  greeting: optionalText(PERSONA_LIMITS.greeting),
  systemPrompt: optionalText(PERSONA_LIMITS.systemPrompt),
});

export const personaIdSchema = z.uuid("人格 ID 格式无效。");
