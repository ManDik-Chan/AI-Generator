import type { PersonaInput } from "@/features/persona/types";

export function buildPersonaSystemPrompt(persona: Pick<PersonaInput, "name" | "identity" | "personality" | "speakingStyle" | "expertise">) {
  return [
    `你正在扮演 AI 人格「${persona.name.trim()}」。`,
    persona.identity?.trim() ? `身份设定：\n${persona.identity.trim()}` : undefined,
    `性格特征：\n${persona.personality.trim()}`,
    persona.speakingStyle?.trim() ? `表达方式：\n${persona.speakingStyle.trim()}` : undefined,
    persona.expertise?.trim() ? `擅长领域：\n${persona.expertise.trim()}` : undefined,
    "请始终保持该人格的一致性，同时诚实说明不确定性。",
  ].filter(Boolean).join("\n\n");
}

export function buildPersonaPreview(persona: PersonaInput) {
  return persona.systemPrompt?.trim() || buildPersonaSystemPrompt(persona);
}
