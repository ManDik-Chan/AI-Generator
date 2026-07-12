import { prisma } from "@/lib/database/prisma";
import type { Prisma } from "@prisma/client";
import type { PersonaChatIdentity, PersonaView } from "@/features/persona/types";

const personaSelect = {
  id: true, name: true, avatarUrl: true, avatarPrompt: true, description: true, identity: true, personality: true,
  speakingStyle: true, expertise: true, greeting: true, systemPrompt: true, archivedAt: true,
  createdAt: true, updatedAt: true,
} as const;

type SelectedPersona = Prisma.PersonaGetPayload<{ select: typeof personaSelect }>;

function toView(persona: SelectedPersona): PersonaView {
  return {
    ...persona,
    avatarUrl: persona.avatarUrl ?? undefined,
    avatarPrompt: persona.avatarPrompt ?? undefined,
    description: persona.description ?? undefined,
    identity: persona.identity ?? undefined,
    speakingStyle: persona.speakingStyle ?? undefined,
    expertise: persona.expertise ?? undefined,
    greeting: persona.greeting ?? undefined,
    archivedAt: persona.archivedAt?.toISOString(),
    createdAt: persona.createdAt.toISOString(),
    updatedAt: persona.updatedAt.toISOString(),
  };
}

export async function getPersonas(userId: string, archived = false): Promise<PersonaView[]> {
  const rows = await prisma.persona.findMany({
    where: { userId, archivedAt: archived ? { not: null } : null },
    orderBy: { updatedAt: "desc" }, select: personaSelect,
  });
  return rows.map(toView);
}

export async function getPersona(userId: string, personaId: string): Promise<PersonaView | null> {
  const row = await prisma.persona.findFirst({ where: { id: personaId, userId }, select: personaSelect });
  return row ? toView(row) : null;
}

export async function getActivePersonaChoices(userId: string): Promise<PersonaChatIdentity[]> {
  const rows = await prisma.persona.findMany({
    where: { userId, archivedAt: null }, orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, avatarUrl: true, description: true, greeting: true },
  });
  return rows.map((row) => ({ ...row, avatarUrl: row.avatarUrl ?? undefined, description: row.description ?? undefined, greeting: row.greeting ?? undefined, archived: false }));
}
