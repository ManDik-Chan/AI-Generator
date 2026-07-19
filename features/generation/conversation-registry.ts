export const CHAT_GENERATION_REGISTRY_KEY = "chat-generation-registry";
export const CHAT_GENERATION_REGISTRY_VERSION = 1;
export const CHAT_GENERATION_REGISTRY_LIMIT = 24;

export interface ConversationGenerationEntry {
  chatMessageId?: string;
  agentRunId?: string;
  updatedAt: number;
}

interface ConversationGenerationRegistry {
  version: typeof CHAT_GENERATION_REGISTRY_VERSION;
  ownerId: string;
  entries: Record<string, ConversationGenerationEntry>;
}

interface RegistryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function emptyRegistry(ownerId: string): ConversationGenerationRegistry {
  return { version: CHAT_GENERATION_REGISTRY_VERSION, ownerId, entries: {} };
}

function validIdentifier(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 100 ? value : undefined;
}

function parseRegistry(storage: RegistryStorage, ownerId: string): ConversationGenerationRegistry {
  try {
    const raw = storage.getItem(CHAT_GENERATION_REGISTRY_KEY);
    if (!raw) return emptyRegistry(ownerId);
    const parsed = JSON.parse(raw) as Partial<ConversationGenerationRegistry>;
    if (parsed.version !== CHAT_GENERATION_REGISTRY_VERSION || parsed.ownerId !== ownerId || !parsed.entries || typeof parsed.entries !== "object") {
      storage.removeItem(CHAT_GENERATION_REGISTRY_KEY);
      return emptyRegistry(ownerId);
    }
    const entries = Object.fromEntries(Object.entries(parsed.entries).flatMap(([key, value]) => {
      if (!key || !value || typeof value !== "object") return [];
      const candidate = value as Partial<ConversationGenerationEntry>;
      const chatMessageId = validIdentifier(candidate.chatMessageId);
      const agentRunId = validIdentifier(candidate.agentRunId);
      if (!chatMessageId && !agentRunId) return [];
      return [[key, {
        ...(chatMessageId ? { chatMessageId } : {}),
        ...(agentRunId ? { agentRunId } : {}),
        updatedAt: typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : 0,
      } satisfies ConversationGenerationEntry]];
    }));
    return { version: CHAT_GENERATION_REGISTRY_VERSION, ownerId, entries };
  } catch {
    storage.removeItem(CHAT_GENERATION_REGISTRY_KEY);
    return emptyRegistry(ownerId);
  }
}

function persistRegistry(storage: RegistryStorage, registry: ConversationGenerationRegistry) {
  const entries = Object.fromEntries(Object.entries(registry.entries)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, CHAT_GENERATION_REGISTRY_LIMIT));
  if (!Object.keys(entries).length) {
    storage.removeItem(CHAT_GENERATION_REGISTRY_KEY);
    return;
  }
  storage.setItem(CHAT_GENERATION_REGISTRY_KEY, JSON.stringify({ ...registry, entries }));
}

export function readConversationGeneration(storage: RegistryStorage, ownerId: string, conversationKey: string) {
  return parseRegistry(storage, ownerId).entries[conversationKey];
}

export function updateConversationGeneration(
  storage: RegistryStorage,
  ownerId: string,
  conversationKey: string,
  patch: { chatMessageId?: string | null; agentRunId?: string | null },
  now = Date.now(),
) {
  if (!conversationKey) return;
  const registry = parseRegistry(storage, ownerId);
  const current = registry.entries[conversationKey] ?? { updatedAt: now };
  const next: ConversationGenerationEntry = {
    ...current,
    ...(patch.chatMessageId !== undefined ? { chatMessageId: patch.chatMessageId || undefined } : {}),
    ...(patch.agentRunId !== undefined ? { agentRunId: patch.agentRunId || undefined } : {}),
    updatedAt: now,
  };
  if (!next.chatMessageId && !next.agentRunId) delete registry.entries[conversationKey];
  else registry.entries[conversationKey] = next;
  persistRegistry(storage, registry);
}

export function migrateConversationGeneration(storage: RegistryStorage, ownerId: string, fromKey: string, conversationId: string, now = Date.now()) {
  if (!fromKey || fromKey === conversationId) return;
  const registry = parseRegistry(storage, ownerId);
  const source = registry.entries[fromKey];
  if (!source) return;
  registry.entries[conversationId] = { ...registry.entries[conversationId], ...source, updatedAt: now };
  delete registry.entries[fromKey];
  persistRegistry(storage, registry);
}

export function clearChatGenerationRegistry(storage: RegistryStorage = window.sessionStorage) {
  storage.removeItem(CHAT_GENERATION_REGISTRY_KEY);
}
