export function activeOwnedPersonaWhere(userId: string, personaId: string) {
  return { id: personaId, userId, archivedAt: null } as const;
}

export function newConversationPersonaData(personaId?: string) {
  return personaId ? { personaId } : {};
}
