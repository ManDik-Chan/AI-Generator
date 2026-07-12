export function activeOwnedPersonaWhere(userId: string, personaId: string) {
  return { id: personaId, userId, archivedAt: null } as const;
}

export function newConversationPersonaData(personaId?: string) {
  return personaId ? { personaId } : {};
}

export function personaConversationUnavailableMessage(archivedAt?: Date | string | null) {
  return archivedAt ? "该人格已在回收站，恢复人格后可以继续对话。" : undefined;
}
