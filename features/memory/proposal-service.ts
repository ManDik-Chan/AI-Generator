import {
  memoryProposalEditableInputSchema,
  memoryProposalIdSchema,
  type MemoryProposalEditableInput,
} from "@/features/memory/schemas";
import {
  persistTrustedMemoryChange,
  lockTrustedMemoryUser,
  runSerializableMemoryTransaction,
  TrustedMemoryWriteError,
} from "@/features/memory/trusted-write";

export type MemoryProposalFinalStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export type MemoryProposalResolutionResult = {
  success: boolean;
  stateChanged: boolean;
  finalStatus: MemoryProposalFinalStatus;
  message: string;
  memoryId?: string;
  idempotent?: boolean;
  code?:
    | "NOT_FOUND"
    | "INVALID_INPUT"
    | "MEMORY_DISABLED"
    | "CAPACITY"
    | "EXPIRED"
    | "NOT_PENDING"
    | "CONFLICT"
    | "FAILED";
  fieldErrors?: Record<string, string[]>;
};

class ProposalRaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalRaceError";
  }
}

function failure(
  code: NonNullable<MemoryProposalResolutionResult["code"]>,
  message: string,
  finalStatus: MemoryProposalFinalStatus = "PENDING",
  stateChanged = false,
): MemoryProposalResolutionResult {
  return { success: false, stateChanged, finalStatus, code, message };
}

function mapTrustedWriteError(
  error: TrustedMemoryWriteError,
): MemoryProposalResolutionResult {
  if (error.code === "MEMORY_DISABLED") {
    return failure("MEMORY_DISABLED", error.message);
  }
  if (error.code === "CAPACITY") {
    return failure("CAPACITY", error.message);
  }
  if (
    error.code === "TARGET_CONFLICT"
    || error.code === "TARGET_MISSING"
    || error.code === "CREATE_CONFLICT"
    || error.code === "DUPLICATE"
  ) {
    return failure("CONFLICT", error.message);
  }
  if (
    error.code === "INVALID_INPUT"
    || error.code === "CREDENTIAL"
    || error.code === "RELATION"
  ) {
    return failure("INVALID_INPUT", error.message);
  }
  return failure("FAILED", error.message);
}

export async function acceptMemoryProposal(
  userId: string,
  proposalId: string,
  editedInput?: MemoryProposalEditableInput,
): Promise<MemoryProposalResolutionResult> {
  if (!memoryProposalIdSchema.safeParse(proposalId).success) {
    return failure("NOT_FOUND", "建议不存在或无权访问。");
  }
  const edited = editedInput
    ? memoryProposalEditableInputSchema.safeParse(editedInput)
    : undefined;
  if (edited && !edited.success) {
    return {
      ...failure("INVALID_INPUT", "请检查编辑后的记忆内容。"),
      fieldErrors: edited.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    return await runSerializableMemoryTransaction(async (transaction) => {
      const profile = await lockTrustedMemoryUser(transaction, userId, false);
      const proposal = await transaction.memoryProposal.findFirst({
        where: { id: proposalId, userId },
      });
      if (!proposal) {
        return failure("NOT_FOUND", "建议不存在或无权访问。");
      }
      if (proposal.status === "ACCEPTED") {
        return {
          success: true,
          stateChanged: false,
          finalStatus: "ACCEPTED",
          memoryId: proposal.resolvedMemoryId ?? undefined,
          idempotent: true,
          message: "这条建议已经确认。",
        };
      }
      if (proposal.status !== "PENDING") {
        return failure(
          proposal.status === "EXPIRED" ? "EXPIRED" : "NOT_PENDING",
          proposal.status === "EXPIRED"
            ? "这条建议已过期，不能确认。"
            : "这条建议已经处理。",
          proposal.status,
        );
      }

      const now = new Date();
      if (proposal.expiresAt.getTime() <= now.getTime()) {
        const expired = await transaction.memoryProposal.updateMany({
          where: { id: proposal.id, userId, status: "PENDING" },
          data: { status: "EXPIRED", resolvedAt: now },
        });
        if (expired.count !== 1) {
          throw new ProposalRaceError("Proposal was resolved concurrently.");
        }
        return failure(
          "EXPIRED",
          "这条建议已过期，不能确认。",
          "EXPIRED",
          true,
        );
      }
      if (!profile.memoryEnabled) {
        return failure(
          "MEMORY_DISABLED",
          "请先开启长期记忆，再确认这条建议。",
        );
      }

      const values = edited?.success
        ? edited.data
        : {
            content: proposal.content,
            category: proposal.category,
            scope: proposal.scope,
            personaId: proposal.personaId ?? undefined,
            importance: proposal.importance,
            topicKey: proposal.topicKey ?? undefined,
            keywords: proposal.keywords,
          };
      const written = await persistTrustedMemoryChange(transaction, {
        userId,
        action: proposal.action,
        targetMemoryId: proposal.targetMemoryId,
        targetMemoryUpdatedAt: proposal.targetMemoryUpdatedAt,
        targetMemoryRevision: proposal.targetMemoryRevision,
        ...values,
        sourceConversationId: proposal.sourceConversationId,
        sourceMessageId: proposal.sourceMessageId,
        origin: "AUTO_EXTRACTED",
        allowIdempotentDuplicate: proposal.action === "CREATE",
        userLockAlreadyHeld: true,
      });

      const accepted = await transaction.memoryProposal.updateMany({
        where: { id: proposal.id, userId, status: "PENDING" },
        data: {
          status: "ACCEPTED",
          resolvedMemoryId: written.memoryId,
          resolvedAt: now,
          content: values.content,
          category: values.category,
          scope: values.scope,
          personaId: values.scope === "PERSONA" ? values.personaId : null,
          importance: values.importance,
          topicKey: values.topicKey ?? null,
          keywords: values.keywords,
        },
      });
      if (accepted.count !== 1) {
        throw new ProposalRaceError("Proposal was resolved concurrently.");
      }
      return {
        success: true,
        stateChanged: true,
        finalStatus: "ACCEPTED",
        memoryId: written.memoryId,
        idempotent: written.idempotent,
        message: written.created
          ? "建议已确认并新增为长期记忆。"
          : written.updated
            ? "建议已确认，目标正式记忆已更新。"
            : "建议已确认；相同的已启用正式记忆已经存在。",
      };
    });
  } catch (error) {
    if (error instanceof TrustedMemoryWriteError) return mapTrustedWriteError(error);
    console.warn("memory_proposal_accept_failed", {
      userId,
      proposalId,
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return failure("FAILED", "建议确认失败，请稍后重试。");
  }
}

export async function rejectMemoryProposal(
  userId: string,
  proposalId: string,
): Promise<MemoryProposalResolutionResult> {
  if (!memoryProposalIdSchema.safeParse(proposalId).success) {
    return failure("NOT_FOUND", "建议不存在或无权访问。");
  }
  try {
    return await runSerializableMemoryTransaction(async (transaction) => {
      const proposal = await transaction.memoryProposal.findFirst({
        where: { id: proposalId, userId },
        select: { id: true, status: true, expiresAt: true },
      });
      if (!proposal) {
        return failure("NOT_FOUND", "建议不存在或无权访问。");
      }
      if (proposal.status === "REJECTED") {
        return {
          success: true,
          stateChanged: false,
          finalStatus: "REJECTED",
          idempotent: true,
          message: "这条建议已经拒绝。",
        };
      }
      if (proposal.status !== "PENDING") {
        return failure(
          proposal.status === "EXPIRED" ? "EXPIRED" : "NOT_PENDING",
          proposal.status === "EXPIRED"
            ? "这条建议已经过期。"
            : "这条建议已经处理。",
          proposal.status,
        );
      }
      const now = new Date();
      const status = proposal.expiresAt.getTime() <= now.getTime()
        ? "EXPIRED"
        : "REJECTED";
      const rejected = await transaction.memoryProposal.updateMany({
        where: { id: proposal.id, userId, status: "PENDING" },
        data: { status, resolvedAt: now },
      });
      if (rejected.count !== 1) {
        throw new ProposalRaceError("Proposal was resolved concurrently.");
      }
      if (status === "REJECTED") {
        return {
          success: true,
          stateChanged: true,
          finalStatus: "REJECTED",
          message: "建议已拒绝，不会写入长期记忆。",
        };
      }
      return failure("EXPIRED", "这条建议已经过期。", "EXPIRED", true);
    });
  } catch (error) {
    console.warn("memory_proposal_reject_failed", {
      userId,
      proposalId,
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return failure("FAILED", "拒绝建议失败，请稍后重试。");
  }
}
