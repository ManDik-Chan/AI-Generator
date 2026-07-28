import type {
  MemoryOrigin,
  MemoryVerificationMethod,
} from "@prisma/client";

export type TrustedMemoryVerificationSource =
  | "MANUAL_CREATE"
  | "EXPLICIT_REQUEST"
  | "PROPOSAL_ACCEPTANCE"
  | "MANUAL_EDIT";

const VERIFICATION_LABELS = {
  MANUAL_ENTRY: "用户手动添加",
  EXPLICIT_REQUEST: "用户明确要求记住",
  PROPOSAL_ACCEPTANCE: "用户确认 AI 建议",
  MANUAL_REVIEW: "用户已手动核对",
  LEGACY_UNREVIEWED: "旧版自动整理，尚未复核",
} satisfies Record<MemoryVerificationMethod, string>;

const ORIGIN_LABELS = {
  MANUAL: "用户录入",
  CHAT_MESSAGE: "聊天消息",
  AUTO_EXTRACTED: "AI 对话整理",
} satisfies Record<MemoryOrigin, string>;

export function getMemoryVerificationLabel(
  method: MemoryVerificationMethod,
) {
  return VERIFICATION_LABELS[method];
}

export function getMemoryOriginLabel(origin: MemoryOrigin) {
  return ORIGIN_LABELS[origin];
}

export function getTrustedMemoryVerification(
  source: TrustedMemoryVerificationSource,
  verifiedAt = new Date(),
): {
  verificationMethod: Exclude<
    MemoryVerificationMethod,
    "LEGACY_UNREVIEWED"
  >;
  verifiedAt: Date;
} {
  switch (source) {
    case "MANUAL_CREATE":
      return { verificationMethod: "MANUAL_ENTRY", verifiedAt };
    case "EXPLICIT_REQUEST":
      return { verificationMethod: "EXPLICIT_REQUEST", verifiedAt };
    case "PROPOSAL_ACCEPTANCE":
      return { verificationMethod: "PROPOSAL_ACCEPTANCE", verifiedAt };
    case "MANUAL_EDIT":
      return { verificationMethod: "MANUAL_REVIEW", verifiedAt };
  }
}
