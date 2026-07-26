"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/database/prisma";
import { requireUser } from "@/lib/auth/session";
import { validateMemoryRelations } from "@/features/memory/access";
import {
  memoryIdSchema,
  memoryInputSchema,
  type MemoryInput,
  type MemoryProposalEditableInput,
} from "@/features/memory/schemas";
import {
  containsHighConfidenceCredential,
  normalizeMemoryContent,
} from "@/features/memory/security";
import type { MemoryActionResult } from "@/features/memory/types";
import { syncMemoryEmbeddingSafely } from "@/features/memory/embedding-lifecycle";
import {
  acceptMemoryProposal,
  rejectMemoryProposal,
} from "@/features/memory/proposal-service";
import {
  TrustedMemoryWriteError,
  writeTrustedMemoryChange,
} from "@/features/memory/trusted-write";
import {
  getMemories,
  getPendingMemoryProposals,
} from "@/features/memory/queries";

const failure = (
  message: string,
  fieldErrors?: Record<string, string[]>,
  code?: string,
): MemoryActionResult => ({ success: false, message, fieldErrors, code });

function trustedFailure(error: unknown): MemoryActionResult {
  if (!(error instanceof TrustedMemoryWriteError)) {
    return failure("记忆保存失败，请稍后重试。", undefined, "FAILED");
  }
  return failure(
    error.message,
    undefined,
    ["CAPACITY", "DUPLICATE", "CREATE_CONFLICT"].includes(error.code)
      ? error.code
      : "INVALID_INPUT",
  );
}

async function getMemoryResolutionSnapshot(userId: string) {
  try {
    const [memories, proposals] = await Promise.all([
      getMemories(userId),
      getPendingMemoryProposals(userId),
    ]);
    return { memories, proposals };
  } catch (error) {
    console.warn("memory_resolution_snapshot_failed", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return undefined;
  }
}

async function duplicateExists(
  userId: string,
  content: string,
  scope: "GLOBAL" | "PERSONA",
  personaId?: string,
  excludeId?: string,
) {
  const rows = await prisma.memory.findMany({
    where: {
      userId,
      scope,
      personaId: scope === "GLOBAL" ? null : personaId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { content: true },
  });
  const normalized = normalizeMemoryContent(content);
  return rows.some((row) => normalizeMemoryContent(row.content) === normalized);
}

export async function createMemoryAction(
  input: MemoryInput,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  const parsed = memoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      "请检查记忆表单。",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
      "INVALID_INPUT",
    );
  }
  const data = parsed.data;
  try {
    const written = await writeTrustedMemoryChange({
      userId: user.id,
      action: "CREATE",
      content: data.content,
      category: data.category,
      scope: data.scope,
      personaId: data.personaId,
      importance: data.importance,
      topicKey: null,
      keywords: [],
      sourceConversationId: data.sourceConversationId,
      sourceMessageId: data.sourceMessageId,
      origin: data.origin,
      enabled: data.enabled,
      requireMemoryEnabled: false,
      allowIdempotentDuplicate: false,
    });
    if (data.enabled) {
      after(() => syncMemoryEmbeddingSafely(written.memoryId, user.id).then(() => undefined));
    }
    revalidatePath("/memories");
    return {
      success: true,
      id: written.memoryId,
      message: data.origin === "CHAT_MESSAGE"
        ? "已保存为长期记忆。"
        : "记忆已创建。",
    };
  } catch (error) {
    return trustedFailure(error);
  }
}

export async function updateMemoryAction(
  id: string,
  input: MemoryInput,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  if (!memoryIdSchema.safeParse(id).success) {
    return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
  }
  const parsed = memoryInputSchema.safeParse({
    ...input,
    origin: "MANUAL",
    sourceConversationId: undefined,
    sourceMessageId: undefined,
  });
  if (!parsed.success) {
    return failure(
      "请检查记忆表单。",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
      "INVALID_INPUT",
    );
  }
  if (containsHighConfidenceCredential(parsed.data.content)) {
    return failure(
      "请勿将密码、API Key 或访问令牌保存为长期记忆。",
      undefined,
      "INVALID_INPUT",
    );
  }
  const access = await validateMemoryRelations(user.id, parsed.data);
  if (access) return failure(access, undefined, "INVALID_INPUT");
  if (
    await duplicateExists(
      user.id,
      parsed.data.content,
      parsed.data.scope,
      parsed.data.personaId,
      id,
    )
  ) {
    return failure("相同的记忆已经存在。", undefined, "DUPLICATE");
  }
  const result = await prisma.memory.updateMany({
    where: { id, userId: user.id },
    data: {
      content: parsed.data.content,
      category: parsed.data.category,
      scope: parsed.data.scope,
      personaId: parsed.data.scope === "PERSONA" ? parsed.data.personaId : null,
      importance: parsed.data.importance,
      enabled: parsed.data.enabled,
    },
  });
  if (!result.count) {
    return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
  }
  if (parsed.data.enabled) {
    after(() => syncMemoryEmbeddingSafely(id, user.id).then(() => undefined));
  }
  revalidatePath("/memories");
  return { success: true, id, message: "记忆已更新。" };
}

export async function setMemoryEnabledAction(
  id: string,
  enabled: boolean,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  if (!memoryIdSchema.safeParse(id).success) {
    return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
  }
  const result = await prisma.memory.updateMany({
    where: { id, userId: user.id },
    data: { enabled },
  });
  if (!result.count) {
    return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
  }
  if (enabled) {
    after(() => syncMemoryEmbeddingSafely(id, user.id).then(() => undefined));
  }
  revalidatePath("/memories");
  return {
    success: true,
    id,
    message: enabled ? "记忆已启用。" : "记忆已停用。",
  };
}

export async function setMemoryPinnedAction(
  id: string,
  pinned: boolean,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  if (!memoryIdSchema.safeParse(id).success) {
    return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
  }
  const result = await prisma.memory.updateMany({
    where: { id, userId: user.id },
    data: { pinned },
  });
  if (!result.count) {
    return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
  }
  revalidatePath("/memories");
  return {
    success: true,
    id,
    message: pinned ? "记忆已置顶。" : "已取消置顶。",
  };
}

export async function deleteMemoryAction(id: string): Promise<MemoryActionResult> {
  const user = await requireUser();
  if (!memoryIdSchema.safeParse(id).success) {
    return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
  }
  try {
    const result = await prisma.memory.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) {
      return failure("记忆不存在或无权访问。", undefined, "NOT_FOUND");
    }
    revalidatePath("/memories");
    return { success: true, message: "记忆已删除。" };
  } catch {
    return failure(
      "该记忆仍被待确认或已接受的建议引用，暂时不能删除。",
      undefined,
      "CONFLICT",
    );
  }
}

export async function setMemoryMasterEnabledAction(
  enabled: boolean,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  await prisma.profile.update({
    where: { id: user.id },
    data: { memoryEnabled: enabled },
  });
  revalidatePath("/memories");
  return {
    success: true,
    message: enabled
      ? "长期记忆已开启。"
      : "长期记忆已关闭，数据仍会保留。",
  };
}

export async function acceptMemoryProposalAction(
  id: string,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  const result = await acceptMemoryProposal(user.id, id);
  revalidatePath("/memories");
  if (
    result.success
    && result.stateChanged
    && result.finalStatus === "ACCEPTED"
    && result.memoryId
  ) {
    after(() => syncMemoryEmbeddingSafely(result.memoryId!, user.id).then(() => undefined));
  }
  const resolutionSnapshot = result.stateChanged
    ? await getMemoryResolutionSnapshot(user.id)
    : undefined;
  return {
    ...result,
    id: result.memoryId,
    resolutionSnapshot,
  };
}

export async function acceptEditedMemoryProposalAction(
  id: string,
  input: MemoryProposalEditableInput,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  const result = await acceptMemoryProposal(user.id, id, input);
  revalidatePath("/memories");
  if (
    result.success
    && result.stateChanged
    && result.finalStatus === "ACCEPTED"
    && result.memoryId
  ) {
    after(() => syncMemoryEmbeddingSafely(result.memoryId!, user.id).then(() => undefined));
  }
  const resolutionSnapshot = result.stateChanged
    ? await getMemoryResolutionSnapshot(user.id)
    : undefined;
  return {
    ...result,
    id: result.memoryId,
    resolutionSnapshot,
  };
}

export async function rejectMemoryProposalAction(
  id: string,
): Promise<MemoryActionResult> {
  const user = await requireUser();
  const result = await rejectMemoryProposal(user.id, id);
  revalidatePath("/memories");
  return {
    ...result,
    resolutionSnapshot: result.stateChanged
      ? await getMemoryResolutionSnapshot(user.id)
      : undefined,
  };
}
