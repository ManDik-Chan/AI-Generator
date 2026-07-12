export interface PersonaInput {
  name: string;
  avatarUrl?: string;
  avatarPrompt?: string;
  avatarChoice?: "keep-current" | "preset";
  description?: string;
  identity?: string;
  personality: string;
  speakingStyle?: string;
  expertise?: string;
  greeting?: string;
  systemPrompt?: string;
}

export interface PersonaView extends PersonaInput {
  id: string;
  systemPrompt: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaChatIdentity {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
  greeting?: string;
  archived: boolean;
}

export type PersonaActionResult = { success: true; id: string; message: string } | { success: false; message: string; fieldErrors?: Record<string, string[]> };
