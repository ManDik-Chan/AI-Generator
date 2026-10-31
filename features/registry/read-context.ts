import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { RegistryProtocolError } from "./protocol";
import { authenticate, fail, parse } from "./release-context";

export const tokenInput = z.object({ accessToken: z.string().min(1).max(16384) }).strict();
export const projectInput = tokenInput.extend({ projectId: z.string().uuid() }).strict();
export const pageInput = z.object({ limit: z.number().int().min(1).max(50).default(20), after: z.string().uuid().optional() }).strict();
export type ReadContext = { tx: Prisma.TransactionClient; actor: Awaited<ReturnType<typeof authenticate>>;
  projects: Set<string>; deadlines: Date[]; action: "READ_DRAFT" | "READ_RELEASE" };

export function enabledRead() {
  if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true" || process.env.REGISTRY_INTERNAL_READ_ENABLED !== "true") fail("DISABLED", 403);
}

export async function authorizeProject(ctx: ReadContext, projectId: string) {
  const projects = await ctx.tx.$queryRaw<{ id: string; slug: string; visibility: "PRIVATE" | "PUBLIC" | "UNLISTED";
    currentReleaseId: string | null; revision: number }[]>`SELECT id,slug,visibility,current_release_id AS "currentReleaseId",revision
    FROM public.projects WHERE id=${projectId}::uuid AND archived_at IS NULL FOR SHARE`;
  const memberships = await ctx.tx.$queryRaw<{ roles: ("OWNER" | "EDITOR" | "REVIEWER" | "PUBLISHER" | "VIEWER")[] }[]>`
    SELECT roles FROM public.project_memberships WHERE project_id=${projectId}::uuid AND subject_id=${ctx.actor.id}::uuid AND active FOR SHARE`;
  if (projects.length !== 1 || memberships.length !== 1 || !memberships[0].roles.length) fail("NOT_FOUND", 404);
  ctx.projects.add(projectId);
  return { ...projects[0], roles: memberships[0].roles };
}

/** Privileged ORM reads stay inside this authorization transaction; no caller subject is accepted. */
export async function readTransaction<T>(token: string, action: ReadContext["action"], work: (ctx: ReadContext) => Promise<T>): Promise<T> {
  enabledRead();
  const actor = await authenticate(parse(tokenInput, { accessToken: token }).accessToken);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const sessions = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auth.sessions
          WHERE id=${actor.session}::uuid AND user_id=${actor.id}::uuid AND (not_after IS NULL OR not_after>clock_timestamp())
          AND to_timestamp(${actor.exp})>clock_timestamp() FOR SHARE`;
        if (sessions.length !== 1) fail("AUTH_REQUIRED", 401);
        const operators = await tx.$queryRaw<{ subject_id: string }[]>`SELECT subject_id FROM registry_private.internal_operators
          WHERE subject_id=${actor.id}::uuid AND active AND expires_at>clock_timestamp() FOR SHARE`;
        const actions = await tx.$queryRaw<{ subject_id: string }[]>`SELECT subject_id FROM registry_private.operator_actions
          WHERE subject_id=${actor.id}::uuid AND action=${action} AND active AND expires_at>clock_timestamp() FOR SHARE`;
        if (operators.length !== 1 || actions.length !== 1) fail("FORBIDDEN", 403);
        const ctx: ReadContext = { tx, actor, action, projects: new Set(), deadlines: [] };
        const result = await work(ctx);
        const [fresh] = await tx.$queryRaw<{ session: boolean; qualified: boolean; members: boolean }[]>`
          WITH tick AS MATERIALIZED (SELECT clock_timestamp() AS at)
          SELECT EXISTS(SELECT 1 FROM auth.sessions s,tick WHERE s.id=${actor.session}::uuid AND s.user_id=${actor.id}::uuid
            AND (s.not_after IS NULL OR s.not_after>tick.at) AND to_timestamp(${actor.exp})>tick.at) AS session,
          (EXISTS(SELECT 1 FROM registry_private.internal_operators o,tick WHERE o.subject_id=${actor.id}::uuid AND o.active AND o.expires_at>tick.at)
            AND EXISTS(SELECT 1 FROM registry_private.operator_actions a,tick WHERE a.subject_id=${actor.id}::uuid AND a.action=${action} AND a.active AND a.expires_at>tick.at)
            AND NOT EXISTS(SELECT 1 FROM unnest(${ctx.deadlines.map(d => d.toISOString())}::timestamptz[]) expiry,tick WHERE expiry<=tick.at)) AS qualified,
          NOT EXISTS(SELECT 1 FROM unnest(${[...ctx.projects]}::uuid[]) p(id) WHERE NOT EXISTS(
            SELECT 1 FROM public.projects p2 JOIN public.project_memberships m ON m.project_id=p2.id
            WHERE p2.id=p.id AND p2.archived_at IS NULL AND m.subject_id=${actor.id}::uuid AND m.active AND cardinality(m.roles)>0)) AS members`;
        if (!fresh.session) fail("AUTH_REQUIRED", 401);
        if (!fresh.qualified) fail("FORBIDDEN", 403);
        if (!fresh.members) fail("NOT_FOUND", 404);
        return result;
      }, { isolationLevel: "Serializable", timeout: 15000, maxWait: 5000 });
    } catch (error) {
      if (error instanceof RegistryProtocolError) throw error;
      const e = error as { code?: string; meta?: { code?: string } };
      if (e.code === "P2034" || ["40001", "40P01"].includes(e.meta?.code ?? "")) {
        if (attempt < 2) continue;
        fail("CONFLICT");
      }
      fail("UNAVAILABLE", 503);
    }
  }
  return fail("CONFLICT");
}

export { parse };
