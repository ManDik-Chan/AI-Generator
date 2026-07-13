import { normalizeMemoryContent } from "@/features/memory/security";

export interface MemoryCandidate {
  id: string; content: string; category: string; scope: "GLOBAL" | "PERSONA"; personaId?: string | null;
  importance: number; enabled: boolean; updatedAt: Date | string; topicKey?: string | null; keywords?: string[];
  pinned?: boolean; useCount?: number; lastUsedAt?: Date | string | null;
}
export interface SelectMemoryOptions { currentMessage: string; recentUserMessages: string[]; personaId?: string; candidates: MemoryCandidate[]; maxItems: number; maxChars: number }

export function memoryTerms(text: string) { const normalized = text.toLocaleLowerCase("en-US").replace(/[\p{P}\p{S}]+/gu, " "); const terms = new Set(normalized.match(/[a-z0-9]+/g) ?? []); const cjkRuns = normalized.match(/[\p{Script=Han}]+/gu) ?? []; for (const run of cjkRuns) { if (run.length === 1) terms.add(run); else for (let index = 0; index < run.length - 1; index += 1) terms.add(run.slice(index, index + 2)); } return terms; }
const overlap = (left: Set<string>, right: Set<string>) => { let count = 0; for (const term of left) if (right.has(term)) count += 1; return count; };
export function isMemoryOverviewIntent(text: string) { return /(?:你记得我什么|你知道哪些关于我的信息|长期偏好|还记得我的|关于我的记忆)/u.test(text); }

export function selectRelevantMemories(options: SelectMemoryOptions) {
  const current = memoryTerms(options.currentMessage); const recent = memoryTerms(options.recentUserMessages.join(" ")); const overview = isMemoryOverviewIntent(options.currentMessage);
  const referenceTime = options.candidates.reduce((latest, memory) => Math.max(latest, new Date(memory.updatedAt).getTime()), 0);
  const scored = options.candidates.filter((memory) => memory.enabled && (memory.scope === "GLOBAL" || (memory.scope === "PERSONA" && memory.personaId === options.personaId))).map((memory) => {
    const contentTerms = memoryTerms(memory.content); const keywordTerms = memoryTerms((memory.keywords ?? []).join(" ")); const topicTerms = memoryTerms((memory.topicKey ?? "").replace(/[._-]+/g, " "));
    const direct = overlap(contentTerms, current); const keyword = overlap(keywordTerms, current); const topic = overlap(topicTerms, current); const context = overlap(new Set([...contentTerms, ...keywordTerms]), recent); const matched = direct + keyword + topic + context;
    const ageDays = Math.max(0, (referenceTime - new Date(memory.updatedAt).getTime()) / 86_400_000); const lastUsed = memory.lastUsedAt ? new Date(memory.lastUsedAt).getTime() : 0; const lastUsedBoost = lastUsed ? Math.max(0, 1.5 - (referenceTime - lastUsed) / 86_400_000 / 180) : 0;
    const score = direct * 8 + keyword * 12 + topic * 9 + context * 3 + memory.importance * 1.5 + (memory.pinned ? 5 : 0) + Math.min(3, Math.log2((memory.useCount ?? 0) + 1)) + lastUsedBoost + Math.max(0, 2 - ageDays / 180) + (memory.scope === "PERSONA" ? 1 : 0) + (["constraint", "profile"].includes(memory.category) ? 0.5 : 0);
    return { memory, matched, score };
  }).filter(({ memory, matched }) => matched > 0 || memory.importance >= 4 || (overview && (memory.pinned || memory.importance >= 3 || Boolean(memory.lastUsedAt)))).sort((a, b) => b.score - a.score || Number(Boolean(b.memory.pinned)) - Number(Boolean(a.memory.pinned)) || b.memory.importance - a.memory.importance || new Date(b.memory.updatedAt).getTime() - new Date(a.memory.updatedAt).getTime() || a.memory.id.localeCompare(b.memory.id));
  const selected: MemoryCandidate[] = []; const topics = new Set<string>(); let length = 0; let fallbackCount = 0;
  for (const item of scored) { if (selected.length >= options.maxItems) break; if (!item.matched && !overview && ++fallbackCount > 2) continue; const key = item.memory.topicKey ? `topic:${item.memory.topicKey}` : `content:${normalizeMemoryContent(item.memory.content)}`; if (topics.has(key)) continue; if (length + item.memory.content.length > options.maxChars) continue; topics.add(key); selected.push(item.memory); length += item.memory.content.length; }
  return selected;
}
