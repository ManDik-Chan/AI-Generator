export interface MemoryCandidate {
  id: string;
  content: string;
  category: string;
  scope: "GLOBAL" | "PERSONA";
  personaId?: string | null;
  importance: number;
  enabled: boolean;
  updatedAt: Date | string;
}

export interface SelectMemoryOptions {
  currentMessage: string;
  recentUserMessages: string[];
  personaId?: string;
  candidates: MemoryCandidate[];
  maxItems: number;
  maxChars: number;
}

export function memoryTerms(text: string) {
  const normalized = text.toLocaleLowerCase("en-US").replace(/[\p{P}\p{S}]+/gu, " ");
  const terms = new Set(normalized.match(/[a-z0-9]+/g) ?? []);
  const cjkRuns = normalized.match(/[\p{Script=Han}]+/gu) ?? [];

  for (const run of cjkRuns) {
    if (run.length === 1) terms.add(run);
    else {
      for (let index = 0; index < run.length - 1; index += 1) {
        terms.add(run.slice(index, index + 2));
      }
    }
  }

  return terms;
}

export function selectRelevantMemories(options: SelectMemoryOptions) {
  const current = memoryTerms(options.currentMessage);
  const recent = memoryTerms(options.recentUserMessages.join(" "));
  const referenceTime = options.candidates.reduce(
    (latest, memory) => Math.max(latest, new Date(memory.updatedAt).getTime()),
    0,
  );
  const scored = options.candidates
    .filter(
      (memory) =>
        memory.enabled &&
        (memory.scope === "GLOBAL" ||
          (memory.scope === "PERSONA" && memory.personaId === options.personaId)),
    )
    .map((memory) => {
      const terms = memoryTerms(memory.content);
      let direct = 0;
      let context = 0;

      for (const term of terms) {
        if (current.has(term)) direct += 1;
        if (recent.has(term)) context += 1;
      }

      const overlap = direct + context;
      const ageDays = Math.max(
        0,
        (referenceTime - new Date(memory.updatedAt).getTime()) / 86_400_000,
      );
      const score =
        direct * 8 +
        context * 3 +
        memory.importance * 1.5 +
        Math.max(0, 2 - ageDays / 180) +
        (memory.scope === "PERSONA" ? 1 : 0) +
        (["constraint", "profile"].includes(memory.category) ? 0.5 : 0);

      return { memory, overlap, score };
    })
    .filter(({ memory, overlap }) => overlap > 0 || memory.importance >= 4)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.memory.importance - a.memory.importance ||
        new Date(b.memory.updatedAt).getTime() - new Date(a.memory.updatedAt).getTime() ||
        a.memory.id.localeCompare(b.memory.id),
    );

  const selected: MemoryCandidate[] = [];
  let length = 0;
  let fallbackCount = 0;

  for (const item of scored) {
    if (selected.length >= options.maxItems) break;
    if (!item.overlap && ++fallbackCount > 2) continue;
    if (length + item.memory.content.length > options.maxChars) continue;
    selected.push(item.memory);
    length += item.memory.content.length;
  }

  return selected;
}
