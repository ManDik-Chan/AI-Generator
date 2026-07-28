import { Prisma, type MemoryOrigin } from "@prisma/client";

import { getMemoryMaxTotal } from "@/features/memory/constants";
import { memoryProposalEditableInputSchema } from "@/features/memory/schemas";
import {
  containsHighConfidenceCredential,
  normalizeMemoryContent,
} from "@/features/memory/security";
import {
  getTrustedMemoryVerification,
  type TrustedMemoryVerificationSource,
} from "@/features/memory/verification";
import { prisma } from "@/lib/database/prisma";

export type TrustedMemoryWriteErrorCode =
  | "INVALID_INPUT"
  | "CREDENTIAL"
  | "MEMORY_DISABLED"
  | "RELATION"
  | "CAPACITY"
  | "DUPLICATE"
  | "CREATE_CONFLICT"
  | "TARGET_MISSING"
  | "TARGET_CONFLICT";

export class TrustedMemoryWriteError extends Error {
  constructor(
    public readonly code: TrustedMemoryWriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TrustedMemoryWriteError";
  }
}

export interface TrustedMemoryWriteInput {
  userId: string;
  action: "CREATE" | "UPDATE";
  targetMemoryId?: string | null;
  targetMemoryUpdatedAt?: Date | string | null;
  targetMemoryRevision?: number | null;
  content: string;
  category: string;
  scope: "GLOBAL" | "PERSONA";
  personaId?: string | null;
  importance: number;
  topicKey?: string | null;
  keywords: string[];
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  origin: MemoryOrigin;
  verificationSource: TrustedMemoryVerificationSource;
  verificationNow?: Date;
  enabled?: boolean;
  requireMemoryEnabled?: boolean;
  allowIdempotentDuplicate?: boolean;
  userLockAlreadyHeld?: boolean;
}

export interface TrustedMemoryWriteResult {
  memoryId: string;
  created: boolean;
  updated: boolean;
  idempotent: boolean;
}

function isSerializableRetry(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  return error.code === "P2010"
    && typeof error.meta === "object"
    && error.meta !== null
    && "code" in error.meta
    && error.meta.code === "40001";
}

export async function runSerializableMemoryTransaction<T>(
  task: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(task, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt < 2
        && (
          isSerializableRetry(error)
          || (
            error instanceof Error
            && error.name === "ProposalRaceError"
          )
        )
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Serializable memory transaction retry exhausted.");
}

export async function lockTrustedMemoryUser(
  transaction: Prisma.TransactionClient,
  userId: string,
  requireMemoryEnabled: boolean,
) {
  const profiles = await transaction.$queryRaw<Array<{ memoryEnabled: boolean }>>`
    UPDATE "public"."profiles" AS p
    SET "memory_enabled" = p."memory_enabled"
    WHERE p."id" = ${userId}::uuid
    RETURNING p."memory_enabled" AS "memoryEnabled"
  `;
  const profile = profiles[0];
  if (!profile) {
    throw new TrustedMemoryWriteError("RELATION", "用户不存在或无权访问。");
  }
  if (requireMemoryEnabled && !profile.memoryEnabled) {
    throw new TrustedMemoryWriteError("MEMORY_DISABLED", "请先开启长期记忆，再确认这条建议。");
  }
  return profile;
}

async function validateRelations(
  transaction: Prisma.TransactionClient,
  input: TrustedMemoryWriteInput,
  personaId: string | null,
) {
  if (input.scope === "PERSONA") {
    const persona = await transaction.persona.findFirst({
      where: { id: personaId ?? undefined, userId: input.userId },
      select: { id: true },
    });
    if (!persona) {
      throw new TrustedMemoryWriteError("RELATION", "Persona 不存在或无权访问。");
    }
  }

  if (Boolean(input.sourceConversationId) !== Boolean(input.sourceMessageId)) {
    throw new TrustedMemoryWriteError("RELATION", "聊天来源信息不完整。");
  }
  if (!input.sourceConversationId) return;

  const message = await transaction.message.findFirst({
    where: {
      id: input.sourceMessageId!,
      conversationId: input.sourceConversationId,
      role: "USER",
      status: "COMPLETE",
      supersededAt: null,
      conversation: { userId: input.userId },
    },
    select: { id: true },
  });
  if (!message) {
    throw new TrustedMemoryWriteError("RELATION", "来源消息不存在、已失效或无权访问。");
  }
}

async function findExactDuplicate(
  transaction: Prisma.TransactionClient,
  input: TrustedMemoryWriteInput,
  personaId: string | null,
  excludeId?: string,
) {
  const rows = await transaction.memory.findMany({
    where: {
      userId: input.userId,
      scope: input.scope,
      personaId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, content: true, enabled: true },
  });
  const normalized = normalizeMemoryContent(input.content);
  return rows.find((row) => normalizeMemoryContent(row.content) === normalized);
}

export async function persistTrustedMemoryChange(
  transaction: Prisma.TransactionClient,
  input: TrustedMemoryWriteInput,
): Promise<TrustedMemoryWriteResult> {
  const parsed = memoryProposalEditableInputSchema.safeParse({
    content: input.content,
    category: input.category,
    scope: input.scope,
    personaId: input.personaId ?? undefined,
    importance: input.importance,
    topicKey: input.topicKey ?? undefined,
    keywords: input.keywords,
  });
  if (!parsed.success) {
    throw new TrustedMemoryWriteError("INVALID_INPUT", "记忆内容未通过校验。");
  }
  if (containsHighConfidenceCredential(parsed.data.content)) {
    throw new TrustedMemoryWriteError("CREDENTIAL", "内容包含密码、API Key 或访问令牌，不能保存。");
  }

  const personaId = parsed.data.scope === "PERSONA" ? parsed.data.personaId! : null;
  if (!input.userLockAlreadyHeld) {
    await lockTrustedMemoryUser(
      transaction,
      input.userId,
      input.requireMemoryEnabled ?? true,
    );
  }
  await validateRelations(transaction, input, personaId);

  const commonData = {
    content: parsed.data.content,
    category: parsed.data.category,
    scope: parsed.data.scope,
    personaId,
    importance: parsed.data.importance,
    topicKey: parsed.data.topicKey ?? null,
    keywords: parsed.data.keywords,
    origin: input.origin,
    ...getTrustedMemoryVerification(
      input.verificationSource,
      input.verificationNow,
    ),
    sourceConversationId: input.sourceConversationId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
  };

  if (input.action === "UPDATE") {
    if (
      !input.targetMemoryId
      || !input.targetMemoryUpdatedAt
      || !input.targetMemoryRevision
    ) {
      throw new TrustedMemoryWriteError("TARGET_MISSING", "原记忆快照不完整，不能改为新增记忆。");
    }
    const target = await transaction.memory.findFirst({
      where: { id: input.targetMemoryId, userId: input.userId },
      select: {
        id: true,
        scope: true,
        personaId: true,
        enabled: true,
        revision: true,
      },
    });
    if (!target) {
      throw new TrustedMemoryWriteError("TARGET_MISSING", "原记忆已不存在，不能改为新增记忆。");
    }
    if (
      !target.enabled
      || target.scope !== parsed.data.scope
      || target.personaId !== personaId
      || target.revision !== input.targetMemoryRevision
    ) {
      throw new TrustedMemoryWriteError(
        "TARGET_CONFLICT",
        "原记忆已发生变化，请刷新后检查最新版本。",
      );
    }
    if (await findExactDuplicate(transaction, input, personaId, target.id)) {
      throw new TrustedMemoryWriteError("DUPLICATE", "相同的正式记忆已经存在。");
    }
    if (parsed.data.topicKey) {
      const topicConflict = await transaction.memory.findFirst({
        where: {
          userId: input.userId,
          id: { not: target.id },
          scope: parsed.data.scope,
          personaId,
          topicKey: parsed.data.topicKey,
        },
        select: { id: true },
      });
      if (topicConflict) {
        throw new TrustedMemoryWriteError(
          "CREATE_CONFLICT",
          "编辑后的主题与另一条正式记忆冲突。",
        );
      }
    }
    const updated = await transaction.memory.updateMany({
      where: {
        id: target.id,
        userId: input.userId,
        enabled: true,
        revision: input.targetMemoryRevision,
      },
      data: commonData,
    });
    if (updated.count !== 1) {
      throw new TrustedMemoryWriteError(
        "TARGET_CONFLICT",
        "原记忆已发生变化，请刷新后检查最新版本。",
      );
    }
    return {
      memoryId: target.id,
      created: false,
      updated: true,
      idempotent: false,
    };
  }

  const duplicate = await findExactDuplicate(transaction, input, personaId);
  if (duplicate) {
    if (!duplicate.enabled) {
      throw new TrustedMemoryWriteError(
        "CREATE_CONFLICT",
        "相同内容的正式记忆目前已停用；请先处理该记忆。",
      );
    }
    if (!input.allowIdempotentDuplicate) {
      throw new TrustedMemoryWriteError("DUPLICATE", "相同的正式记忆已经存在。");
    }
    return {
      memoryId: duplicate.id,
      created: false,
      updated: false,
      idempotent: true,
    };
  }

  if (parsed.data.topicKey) {
    const sameTopic = await transaction.memory.findFirst({
      where: {
        userId: input.userId,
        scope: parsed.data.scope,
        personaId,
        topicKey: parsed.data.topicKey,
      },
      select: { id: true, enabled: true },
    });
    if (sameTopic) {
      throw new TrustedMemoryWriteError(
        "CREATE_CONFLICT",
        sameTopic.enabled
          ? "建议生成后出现了同主题正式记忆；新增建议不会覆盖它。"
          : "同主题正式记忆目前已停用；新增建议不会覆盖它。",
      );
    }
  }

  const limit = getMemoryMaxTotal();
  const total = await transaction.memory.count({ where: { userId: input.userId } });
  if (total >= limit) {
    throw new TrustedMemoryWriteError(
      "CAPACITY",
      `已达到 ${limit} 条记忆上限，请先删除不再需要的内容。`,
    );
  }
  const created = await transaction.memory.create({
    data: {
      ...commonData,
      userId: input.userId,
      enabled: input.enabled ?? true,
    },
    select: { id: true },
  });
  return {
    memoryId: created.id,
    created: true,
    updated: false,
    idempotent: false,
  };
}

export function writeTrustedMemoryChange(input: TrustedMemoryWriteInput) {
  return runSerializableMemoryTransaction((transaction) =>
    persistTrustedMemoryChange(transaction, input));
}
