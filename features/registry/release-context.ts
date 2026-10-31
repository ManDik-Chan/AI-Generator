import "server-only";

import { createClient } from "@supabase/supabase-js";
import { Prisma, type Project } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { RegistryProtocolError } from "./protocol";
export const RELEASE_POLICY_REVISION = 1;
type Tx = Prisma.TransactionClient;
export type Action = "READ_RELEASE" | "REQUEST_RELEASE" | "APPROVE_RELEASE" | "PUBLISH_RELEASE" | "WITHDRAW_RELEASE" | "ROLLBACK_RELEASE";
export const uuid = z.string().uuid();
export const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const readInput = z.object({ accessToken: z.string().min(1).max(16384), projectId: uuid }).strict();
export const writeInput = readInput.extend({ ifMatch: z.string().max(100).optional(), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), input: z.unknown() }).strict();
export type WriteInput = z.input<typeof writeInput>;
export type ReadInput = z.input<typeof readInput>;
type Principal = { id: string; session: string; exp: number };
export type Context = { tx: Tx; project: Project; actor: Principal; trackReview: boolean;
  parties: Map<string, { subject: string; action: Action; roles: string[] }>; deadlines: Date[] };

export function fail(code: string, status = 409): never { throw new RegistryProtocolError(code, status); }
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); } catch { return fail("INVALID_INPUT", 422); }
}
export function enabled() {
  if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true" || process.env.REGISTRY_RELEASE_COMMANDS_ENABLED !== "true") fail("DISABLED", 403);
}
export async function authenticate(token: string): Promise<Principal> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return fail("UNAVAILABLE", 503);
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) }) },
  });
  try {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return fail("AUTH_REQUIRED", 401);
    // Decoding is allowed only AFTER Auth verified the signature. No JWT role,
    // metadata, owner or caller-provided subject participates in authorization.
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const verified = parse(z.object({ sub: uuid, session_id: uuid, exp: z.number().int().positive() }), claims);
    if (verified.sub !== data.user.id) return fail("AUTH_REQUIRED", 401);
    return { id: data.user.id, session: verified.session_id, exp: verified.exp };
  } catch { return fail("AUTH_REQUIRED", 401); }
}
const roles: Record<Action, string[]> = {
  READ_RELEASE: ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"],
  REQUEST_RELEASE: ["OWNER", "PUBLISHER"], APPROVE_RELEASE: ["REVIEWER"],
  PUBLISH_RELEASE: ["OWNER", "PUBLISHER"], WITHDRAW_RELEASE: ["OWNER", "PUBLISHER"],
  ROLLBACK_RELEASE: ["OWNER", "PUBLISHER"],
};
async function session(tx: Tx, actor: Principal) {
  const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM auth.sessions
    WHERE id=${actor.session}::uuid AND user_id=${actor.id}::uuid
      AND (not_after IS NULL OR not_after>clock_timestamp()) AND to_timestamp(${actor.exp})>clock_timestamp() FOR SHARE`;
  if (found.length !== 1) fail("AUTH_REQUIRED", 401);
}
async function qualification(tx: Tx, subject: string, action: Action) {
  const operators = await tx.$queryRaw<{ subject_id: string }[]>`SELECT subject_id FROM registry_private.internal_operators
    WHERE subject_id=${subject}::uuid AND active AND expires_at>clock_timestamp() FOR SHARE`;
  const actions = await tx.$queryRaw<{ subject_id: string }[]>`SELECT subject_id FROM registry_private.operator_actions
    WHERE subject_id=${subject}::uuid AND action=${action} AND active AND expires_at>clock_timestamp() FOR SHARE`;
  if (operators.length !== 1 || actions.length !== 1) fail("FORBIDDEN", 403);
}
async function member(tx: Tx, projectId: string, subject: string, action: Action) {
  const rows = await tx.$queryRaw<{ roles: string[] }[]>`SELECT roles FROM public.project_memberships
    WHERE project_id=${projectId}::uuid AND subject_id=${subject}::uuid AND active FOR SHARE`;
  if (rows.length !== 1 || !rows[0].roles.some(role => roles[action].includes(role))) fail("NOT_FOUND", 404);
}
export async function authority(ctx: Context, subject: string, action: Action) {
  await qualification(ctx.tx, subject, action); await member(ctx.tx, ctx.project.id, subject, action);
  if (ctx.trackReview || subject === ctx.actor.id) ctx.parties.set(`${subject}:${action}`, { subject, action, roles: roles[action] });
}
async function finalFreshness(ctx: Context) {
  // One materialized database clock defines the command's final validation
  // instant after ALL effects and the response receipt have been written.
  const [valid] = await ctx.tx.$queryRaw<{ session_valid: boolean; authorizations_valid: boolean; reviews_valid: boolean }[]>`
    WITH tick AS MATERIALIZED (SELECT clock_timestamp() AS at)
    SELECT EXISTS(SELECT 1 FROM auth.sessions s,tick WHERE s.id=${ctx.actor.session}::uuid AND s.user_id=${ctx.actor.id}::uuid
      AND (s.not_after IS NULL OR s.not_after>tick.at) AND to_timestamp(${ctx.actor.exp})>tick.at) AS session_valid,
      NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(${JSON.stringify([...ctx.parties.values()])}::jsonb) AS v(subject uuid,action text,roles text[]),tick
        WHERE NOT EXISTS(SELECT 1 FROM registry_private.internal_operators o WHERE o.subject_id=v.subject AND o.active AND o.expires_at>tick.at)
          OR NOT EXISTS(SELECT 1 FROM registry_private.operator_actions a WHERE a.subject_id=v.subject AND a.action=v.action AND a.active AND a.expires_at>tick.at)
          OR NOT EXISTS(SELECT 1 FROM public.project_memberships m WHERE m.project_id=${ctx.project.id}::uuid AND m.subject_id=v.subject
            AND m.active AND m.roles && v.roles::public."ProjectRole"[])) AS authorizations_valid,
      NOT EXISTS(SELECT 1 FROM unnest(${ctx.deadlines.map(date => date.toISOString())}::timestamptz[]) expiry,tick WHERE expiry<=tick.at) AS reviews_valid`;
  if (!valid.session_valid) fail("AUTH_REQUIRED", 401);
  if (!valid.authorizations_valid) fail("FORBIDDEN", 403);
  if (!valid.reviews_valid) fail("APPROVAL_INVALID");
}
function retryable(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string } };
  return e.code === "P2034" || ["40001", "40P01"].includes(e.meta?.code ?? "");
}
export async function transaction<T>(actor: Principal, projectId: string, action: Action, work: (ctx: Context) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        await session(tx, actor); await qualification(tx, actor.id, action);
        const projects = await tx.$queryRaw<Project[]>`SELECT id,slug,owner_id AS "ownerId",visibility,archived_at AS "archivedAt",
          current_release_id AS "currentReleaseId",authz_epoch AS "authzEpoch",revision,created_at AS "createdAt",updated_at AS "updatedAt"
          FROM public.projects WHERE id=${projectId}::uuid FOR UPDATE`;
        if (projects.length !== 1 || projects[0].archivedAt) return fail("NOT_FOUND", 404);
        const ctx: Context = { tx, actor, project: projects[0], trackReview: action !== "READ_RELEASE", parties: new Map(), deadlines: [] };
        await member(tx, projectId, actor.id, action);
        ctx.parties.set(`${actor.id}:${action}`, { subject: actor.id, action, roles: roles[action] });
        const result = await work(ctx);
        // Locks serialize explicit revocation; wall-clock checks also catch
        // qualification or JWT expiry during an otherwise valid transaction.
        await finalFreshness(ctx);
        return result;
      }, { isolationLevel: "Serializable", timeout: 15000, maxWait: 5000 });
    } catch (error) {
      if (error instanceof RegistryProtocolError) throw error;
      if (!retryable(error)) {
        const code = (error as { code?: string }).code ?? "";
        // No ORM messages, SQL, credentials or foreign identifiers cross the
        // protocol boundary, including a cross-project document-ID race.
        if (["P2002", "P2003", "P2004", "P2010", "P2025"].includes(code)) return fail("CONFLICT");
        return fail("UNAVAILABLE", 503);
      }
      if (attempt === 2) return fail("CONFLICT");
    }
  }
  return fail("CONFLICT");
}
