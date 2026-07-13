import { createHash } from "node:crypto";

interface EmbeddableMemory {
  content: string;
  category: string;
  topicKey?: string | null;
  keywords?: string[];
}

export function readableMemoryTopic(topicKey?: string | null) {
  return (topicKey ?? "").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildMemoryEmbeddingText(memory: EmbeddableMemory) {
  const keywords = [...new Set((memory.keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean))];
  return [
    `类别：${memory.category.trim()}`,
    `主题：${readableMemoryTopic(memory.topicKey)}`,
    `内容：${memory.content.trim()}`,
    `关键词：${keywords.join("，")}`,
  ].join("\n");
}

export function computeMemoryEmbeddingHash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
