import type { PersonaInput } from "@/features/persona/types";

export const unsafeAvatarPromptPattern = /(?:https?:|javascript:|data:|api[_ -]?key|storage|bucket|\/api\/|[A-Za-z]:\\)/i;

export function cleanAvatarPrompt(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

export function buildPersonaAvatarPrompt(persona: Pick<PersonaInput, "name" | "identity" | "personality" | "speakingStyle" | "expertise">) {
  return cleanAvatarPrompt(`单人头像，${persona.name}，${persona.identity || "虚构 AI 人格"}，性格气质：${persona.personality}，${persona.speakingStyle || "自然友好"}，擅长：${persona.expertise || "通用协助"}，统一精致插画风格，自然表情，得体服装，简洁背景，居中半身头像构图`).slice(0, 900);
}

export function resolvePersonaAvatarPrompt(input: PersonaInput) {
  const prompt = cleanAvatarPrompt(input.avatarPrompt || "") || buildPersonaAvatarPrompt(input);
  if (!prompt || prompt.length > 900 || unsafeAvatarPromptPattern.test(prompt)) throw new Error("头像提示词包含不允许的内容。");
  return prompt;
}
