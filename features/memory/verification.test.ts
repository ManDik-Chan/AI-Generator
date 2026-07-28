import { describe, expect, it } from "vitest";

import {
  getMemoryOriginLabel,
  getMemoryVerificationLabel,
  getTrustedMemoryVerification,
} from "@/features/memory/verification";

describe("memory verification labels and trusted writes", () => {
  it.each([
    ["MANUAL_ENTRY", "用户手动添加"],
    ["EXPLICIT_REQUEST", "用户明确要求记住"],
    ["PROPOSAL_ACCEPTANCE", "用户确认 AI 建议"],
    ["MANUAL_REVIEW", "用户已手动核对"],
    ["LEGACY_UNREVIEWED", "旧版自动整理，尚未复核"],
  ] as const)("maps %s to one user-visible label", (method, label) => {
    expect(getMemoryVerificationLabel(method)).toBe(label);
  });

  it.each([
    ["MANUAL", "用户录入"],
    ["CHAT_MESSAGE", "聊天消息"],
    ["AUTO_EXTRACTED", "AI 对话整理"],
  ] as const)("keeps origin %s visibly distinct from verification", (origin, label) => {
    expect(getMemoryOriginLabel(origin)).toBe(label);
  });

  it.each([
    ["MANUAL_CREATE", "MANUAL_ENTRY"],
    ["EXPLICIT_REQUEST", "EXPLICIT_REQUEST"],
    ["PROPOSAL_ACCEPTANCE", "PROPOSAL_ACCEPTANCE"],
    ["MANUAL_EDIT", "MANUAL_REVIEW"],
  ] as const)("maps server source %s to %s", (source, method) => {
    const now = new Date("2026-07-27T01:37:53.000Z");
    expect(getTrustedMemoryVerification(source, now)).toEqual({
      verificationMethod: method,
      verifiedAt: now,
    });
  });
});
