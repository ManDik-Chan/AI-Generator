import type { MemoryVerificationMethod } from "@prisma/client";

import { getTrustedMemoryVerification } from "@/features/memory/verification";
import { prisma } from "@/lib/database/prisma";

export type LegacyMemoryReviewResult =
  | {
      success: true;
      idempotent: boolean;
      verificationMethod: "MANUAL_REVIEW";
      verifiedAt: Date;
    }
  | {
      success: false;
      code: "NOT_FOUND" | "NOT_LEGACY";
      currentVerificationMethod?: MemoryVerificationMethod;
    };

export async function reviewLegacyMemory(
  userId: string,
  memoryId: string,
  reviewedAt = new Date(),
): Promise<LegacyMemoryReviewResult> {
  const reviewed = await prisma.memory.updateMany({
    where: {
      id: memoryId,
      userId,
      verificationMethod: "LEGACY_UNREVIEWED",
    },
    data: {
      verificationMethod: "MANUAL_REVIEW",
      verifiedAt: reviewedAt,
    },
  });
  if (reviewed.count === 1) {
    return {
      success: true,
      idempotent: false,
      verificationMethod: "MANUAL_REVIEW",
      verifiedAt: reviewedAt,
    };
  }

  const current = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
    select: { verificationMethod: true, verifiedAt: true },
  });
  if (!current) return { success: false, code: "NOT_FOUND" };
  if (
    current.verificationMethod === "MANUAL_REVIEW"
    && current.verifiedAt
  ) {
    return {
      success: true,
      idempotent: true,
      verificationMethod: "MANUAL_REVIEW",
      verifiedAt: current.verifiedAt,
    };
  }
  return {
    success: false,
    code: "NOT_LEGACY",
    currentVerificationMethod: current.verificationMethod,
  };
}

export function updateOwnedMemoryAfterManualReview(
  userId: string,
  memoryId: string,
  input: {
    content: string;
    category: string;
    scope: "GLOBAL" | "PERSONA";
    personaId: string | null;
    importance: number;
    enabled: boolean;
  },
  reviewedAt = new Date(),
) {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.memory.findFirst({
      where: { id: memoryId, userId },
      select: {
        content: true,
        category: true,
        scope: true,
        personaId: true,
        importance: true,
      },
    });
    if (!current) return { count: 0 };

    const semanticChanged = current.content !== input.content
      || current.category !== input.category
      || current.scope !== input.scope
      || current.personaId !== input.personaId
      || current.importance !== input.importance;

    return transaction.memory.updateMany({
      where: {
        id: memoryId,
        userId,
        content: current.content,
        category: current.category,
        scope: current.scope,
        personaId: current.personaId,
        importance: current.importance,
      },
      data: {
        ...input,
        ...(semanticChanged
          ? getTrustedMemoryVerification("MANUAL_EDIT", reviewedAt)
          : {}),
      },
    });
  });
}
