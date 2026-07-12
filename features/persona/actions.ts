"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/database/prisma";
import { requireUser } from "@/lib/auth/session";
import { personaIdSchema, personaInputSchema } from "@/features/persona/schemas";
import { buildPersonaSystemPrompt } from "@/features/persona/prompt";
import { resolvePersonaAvatarPrompt } from "@/features/persona/avatar-prompt";
import { cleanupUnusedGeneratedImage } from "@/features/persona/avatar-service";
import type { PersonaActionResult, PersonaInput } from "@/features/persona/types";

function failure(message: string, fieldErrors?: Record<string, string[]>): PersonaActionResult { return { success: false, message, fieldErrors }; }

function personaData(data: ReturnType<typeof personaInputSchema.parse>) {
  return {
    name: data.name,
    ...(data.avatarChoice === "keep-current" ? {} : { avatarUrl: data.avatarUrl ?? null, avatarImageId: null }),
    avatarPrompt: resolvePersonaAvatarPrompt(data),
    description: data.description ?? null,
    identity: data.identity ?? null,
    personality: data.personality,
    speakingStyle: data.speakingStyle ?? null,
    expertise: data.expertise ?? null,
    greeting: data.greeting ?? null,
    systemPrompt: data.systemPrompt || buildPersonaSystemPrompt(data),
  };
}

export async function createPersonaAction(input: PersonaInput): Promise<PersonaActionResult> {
  const user = await requireUser();
  const parsed = personaInputSchema.safeParse(input);
  if (!parsed.success) return failure("请检查人格表单。", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  const data = parsed.data;
  try {
    const persona = await prisma.persona.create({ data: { ...personaData(data), userId: user.id }, select: { id: true } });
    revalidatePath("/personas");
    return { success: true, id: persona.id, message: "人格已创建。" };
  } catch { return failure("人格保存失败，请稍后重试。"); }
}

export async function updatePersonaAction(personaId: string, input: PersonaInput): Promise<PersonaActionResult> {
  const user = await requireUser();
  if (!personaIdSchema.safeParse(personaId).success) return failure("人格不存在或无权访问。");
  const parsed = personaInputSchema.safeParse(input);
  if (!parsed.success) return failure("请检查人格表单。", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  const data = parsed.data;
  try {
    const previous = data.avatarChoice === "preset"
      ? await prisma.persona.findFirst({ where: { id: personaId, userId: user.id }, select: { avatarImageId: true } })
      : null;
    const result = await prisma.persona.updateMany({ where: { id: personaId, userId: user.id }, data: personaData(data) });
    if (result.count !== 1) return failure("人格不存在或无权访问。");
    if (previous?.avatarImageId) await cleanupUnusedGeneratedImage(user.id, previous.avatarImageId);
    revalidatePath("/personas"); revalidatePath(`/personas/${personaId}`);
    return { success: true, id: personaId, message: "人格已更新。" };
  } catch { return failure("人格更新失败，请稍后重试。"); }
}

async function setArchived(personaId: string, archived: boolean): Promise<PersonaActionResult> {
  const user = await requireUser();
  if (!personaIdSchema.safeParse(personaId).success) return failure("人格不存在或无权访问。");
  try {
    const result = await prisma.persona.updateMany({ where: { id: personaId, userId: user.id }, data: { archivedAt: archived ? new Date() : null } });
    if (result.count !== 1) return failure("人格不存在或无权访问。");
    revalidatePath("/personas"); revalidatePath(`/personas/${personaId}`);
    return { success: true, id: personaId, message: archived ? "人格已归档。" : "人格已恢复。" };
  } catch { return failure(archived ? "人格归档失败，请稍后重试。" : "人格恢复失败，请稍后重试。"); }
}

export async function archivePersonaAction(personaId: string) { return setArchived(personaId, true); }
export async function restorePersonaAction(personaId: string) { return setArchived(personaId, false); }
