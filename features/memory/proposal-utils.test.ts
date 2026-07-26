import { describe, expect, it } from "vitest";

import {
  buildMemoryProposalDedupeKey,
  buildMemoryProposalSuppressionKey,
  getMemoryProposalExpiry,
} from "@/features/memory/proposal-utils";

const base = {
  action: "CREATE" as const,
  scope: "GLOBAL" as const,
  topicKey: "preference.answer_style",
  content: "用户偏好先给结论，再解释。",
  keywords: ["回答风格", "先给结论"],
};

describe("memory proposal idempotency and rejection suppression", () => {
  it("separates source replay idempotency from cross-message rejection suppression", () => {
    const first = {
      ...base,
      sourceMessageId: "11111111-1111-4111-8111-111111111111",
    };
    const second = {
      ...base,
      sourceMessageId: "22222222-2222-4222-8222-222222222222",
    };
    expect(buildMemoryProposalDedupeKey(first))
      .not.toBe(buildMemoryProposalDedupeKey(second));
    expect(buildMemoryProposalSuppressionKey(first))
      .toBe(buildMemoryProposalSuppressionKey(second));
  });

  it("normalizes NFKC, case, whitespace, punctuation and keyword order", () => {
    const variant = {
      ...base,
      content: "  用户偏好先给结论, 再解释!!! ",
      keywords: ["先给结论", "回答风格", "回答风格"],
    };
    expect(buildMemoryProposalSuppressionKey(base))
      .toBe(buildMemoryProposalSuppressionKey(variant));
    expect(buildMemoryProposalSuppressionKey({
      ...base,
      content: "ＵＳＥＲ PREFERS DARK MODE。",
      keywords: ["Dark Mode"],
    })).toBe(buildMemoryProposalSuppressionKey({
      ...base,
      content: "user prefers dark mode",
      keywords: ["dark mode", "DARK MODE"],
    }));
  });

  it("includes target revision in replay idempotency but not rejection suppression", () => {
    const update = {
      ...base,
      action: "UPDATE" as const,
      targetMemoryId: "33333333-3333-4333-8333-333333333333",
      sourceMessageId: "11111111-1111-4111-8111-111111111111",
    };
    expect(buildMemoryProposalDedupeKey({
      ...update,
      targetMemoryRevision: 1,
    })).not.toBe(buildMemoryProposalDedupeKey({
      ...update,
      targetMemoryRevision: 2,
    }));
    expect(buildMemoryProposalSuppressionKey(update))
      .toBe(buildMemoryProposalSuppressionKey({ ...update }));
  });

  it("keeps rejection suppression stable when the same fact changes action", () => {
    expect(buildMemoryProposalSuppressionKey(base)).toBe(
      buildMemoryProposalSuppressionKey({
        ...base,
        action: "UPDATE",
        targetMemoryId: "33333333-3333-4333-8333-333333333333",
      }),
    );
  });

  it("does not collapse two genuinely different facts from one source message", () => {
    const sourceMessageId = "11111111-1111-4111-8111-111111111111";
    expect(buildMemoryProposalDedupeKey({ ...base, sourceMessageId }))
      .not.toBe(buildMemoryProposalDedupeKey({
        ...base,
        sourceMessageId,
        topicKey: "profile.default_language",
        content: "用户的默认语言是中文。",
      }));
  });

  it("uses an exact thirty-day expiry", () => {
    const now = new Date("2026-07-25T00:00:00.000Z");
    expect(getMemoryProposalExpiry(now).toISOString())
      .toBe("2026-08-24T00:00:00.000Z");
  });
});
