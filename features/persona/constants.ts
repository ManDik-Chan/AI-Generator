export interface PersonaAvatarPreset { id: string; src: string; label: string; description: string }

export const PERSONA_AVATAR_PRESETS: PersonaAvatarPreset[] = [
  ["mentor", 1, "温和导师", "温和、可靠的指导者"], ["scholar", 2, "冷静学者", "理性、专注的研究者"],
  ["teacher", 3, "热情教师", "清晰、有感染力的讲解者"], ["creator", 4, "创意伙伴", "灵感丰富的创作伙伴"],
  ["robot", 5, "科技助手", "现代、精准的科技角色"], ["mystic", 6, "神秘顾问", "沉静、有洞察力的顾问"],
  ["coach", 7, "严格教练", "直接、坚定的行动教练"], ["professional", 8, "专业顾问", "稳健、务实的专业人士"],
  ["analyst", 9, "严谨分析师", "重视证据与结构的分析者"], ["nature", 10, "自然伙伴", "轻松、友善的陪伴者"],
  ["energetic", 11, "活力伙伴", "积极、充满行动力的角色"], ["star", 12, "幻想角色", "鲜明、有故事感的虚构角色"],
].map(([id, number, label, description]) => ({ id: String(id), src: `/personas/avatar-${number}.svg`, label: String(label), description: String(description) }));

export const PERSONA_AVATARS = PERSONA_AVATAR_PRESETS.map((preset) => preset.src);

export function resolveAvatarPreset(id: string | undefined, seed: string) {
  const selected = PERSONA_AVATAR_PRESETS.find((preset) => preset.id === id);
  if (selected) return selected;
  const score = [...seed].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
  return PERSONA_AVATAR_PRESETS[score % PERSONA_AVATAR_PRESETS.length];
}

export const PERSONA_LIMITS = {
  name: 40,
  description: 200,
  identity: 1000,
  personality: 1000,
  speakingStyle: 1000,
  expertise: 1000,
  greeting: 1000,
  systemPrompt: 4000,
} as const;
