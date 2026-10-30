// A minimal server capability written against the demo runtime contract.
// It is tested in examples/examples.test.ts; it is not registered on the site,
// because third-party registration needs the Registry, which is not deployed yet.
import { z } from "zod";

import { defineServerCapability } from "@/features/demos/runtime/capability";

const input = z.object({ text: z.string().min(1).max(20_000) }).strict();

const output = z
  .object({
    characters: z.int().min(0),
    words: z.int().min(0),
    sentences: z.int().min(0),
    topWords: z.array(z.object({ word: z.string(), count: z.int().min(1) }).strict()).max(5),
    partial: z.boolean(),
  })
  .strict();

export const textStats = defineServerCapability({
  descriptor: {
    id: "text-stats.analyze",
    project: "text-stats",
    version: "0.1.0",
    title: "文本统计",
    summary: "统计字符、词与句子数量，并列出最常见的词。",
    dataFlow: "platform",
    status: "demo",
    limits: { maxInputBytes: 32 * 1024, defaultDeadlineMs: 1000, maxDeadlineMs: 2000 },
    sourcePath: "examples/capabilities/text-stats.ts",
    docsPath: "/docs/guide#服务端能力",
  },
  input,
  output,
  async execute({ text }, ctx) {
    const counts = new Map<string, number>();
    const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    for (let i = 0; i < words.length; i++) {
      counts.set(words[i], (counts.get(words[i]) ?? 0) + 1);
      if (i % 2000 === 1999) {
        await ctx.checkpoint(); // lets the platform cancel us between chunks
        if (ctx.expired()) return ctx.partial(summary(text, words.length, counts, true));
      }
    }
    return summary(text, words.length, counts, false);
  },
});

function summary(text: string, words: number, counts: Map<string, number>, partial: boolean) {
  return {
    characters: [...text].length,
    words,
    sentences: (text.match(/[.!?。！？]+/g) ?? []).length,
    topWords: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([word, count]) => ({ word, count })),
    partial,
  };
}
