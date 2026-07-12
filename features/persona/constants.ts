export const PERSONA_AVATARS = Array.from({ length: 12 }, (_, index) => `/personas/avatar-${index + 1}.svg`);

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
