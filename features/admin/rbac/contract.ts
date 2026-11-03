import { z } from "zod";

/*
 * View model for the /admin platform-role screens: the consumer side of the P1-RBAC contract.
 *
 * Every authorization fact in here (whether the viewer may manage roles, which roles a given
 * member may be moved to, and why a member is protected) is produced by the server. The UI
 * renders these fields as-is and never derives a permission from role names. It may only show
 * less than the server allows (fail closed), never more.
 *
 * The backend payloads are mapped onto these schemas in one adapter (rbac/server-directory.ts).
 * The role-change result follows the final backend contract in
 * docs/handoffs/2026-11-02-platform-rbac-final-contract.md.
 */

export const PLATFORM_ROLES = ["OWNER", "ADMIN", "USER"] as const;
export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

/** Why the server offers no role change for a member. */
export const ROLE_RESTRICTIONS = ["SELF", "OWNER_PROTECTED", "PEER_ADMIN", "INSUFFICIENT_ROLE"] as const;
export const roleRestrictionSchema = z.enum(ROLE_RESTRICTIONS);
export type RoleRestriction = z.infer<typeof roleRestrictionSchema>;

/** Error codes the role-change action returns. Every one of them means nothing was changed. */
export const ROLE_CHANGE_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "TARGET_PROTECTED",
  "ROLE_CONFLICT",
  "TARGET_NOT_FOUND",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "UNAVAILABLE",
] as const;
export const roleChangeErrorCodeSchema = z.enum(ROLE_CHANGE_ERROR_CODES);
export type RoleChangeErrorCode = z.infer<typeof roleChangeErrorCodeSchema>;

/**
 * Outcomes the client records itself when it cannot read the server's answer. Unlike the
 * server codes, these do not mean "nothing changed": the change may or may not have applied.
 */
export const CLIENT_OUTCOME_CODES = ["CONTRACT_MISMATCH", "UNKNOWN_OUTCOME"] as const;
export type ClientOutcomeCode = (typeof CLIENT_OUTCOME_CODES)[number];
export type RoleChangeFailureCode = RoleChangeErrorCode | ClientOutcomeCode;

const isoDateTime = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();

export const platformViewerSchema = z.object({
  id: z.uuid(),
  platformRole: platformRoleSchema,
  capabilities: z.object({
    /** The viewer may change at least some members' platform roles. Rows still decide per member. */
    manageRoles: z.boolean(),
    /** The viewer may read the role-change audit feed. */
    viewRoleAudit: z.boolean(),
  }),
});
export type PlatformViewer = z.infer<typeof platformViewerSchema>;

export const platformMemberSchema = z
  .object({
    id: z.uuid(),
    email: z.string().min(1),
    displayName: z.string().nullable(),
    platformRole: platformRoleSchema,
    /**
     * Opaque token that changes whenever this member's role changes; sent back for conflict
     * detection. Null when the server does not provide one: such a member is never offered a
     * change, because the request could not carry the version the server must check.
     */
    roleVersion: z.string().min(1).nullable(),
    joinedAt: isoDateTime,
    isViewer: z.boolean(),
    roleChange: z.object({
      /** Roles the server will accept for this member from this viewer, right now. Empty when none. */
      assignableRoles: z.array(platformRoleSchema),
      /** Why no change is offered. Null whenever assignableRoles is non-empty. */
      restriction: roleRestrictionSchema.nullable(),
    }),
    activity: z.object({ conversations: count, personas: count, memories: count, toolRuns: count }).optional(),
  })
  .superRefine((member, context) => {
    const { assignableRoles, restriction } = member.roleChange;
    if (assignableRoles.includes(member.platformRole)) {
      context.addIssue({ code: "custom", message: "assignableRoles must not contain the current role", path: ["roleChange", "assignableRoles"] });
    }
    if (new Set(assignableRoles).size !== assignableRoles.length) {
      context.addIssue({ code: "custom", message: "assignableRoles must not repeat a role", path: ["roleChange", "assignableRoles"] });
    }
    if (assignableRoles.length > 0 && restriction !== null) {
      context.addIssue({ code: "custom", message: "a member with assignable roles cannot also be restricted", path: ["roleChange", "restriction"] });
    }
    if (assignableRoles.length > 0 && member.roleVersion === null) {
      context.addIssue({ code: "custom", message: "a member offered a role change needs a roleVersion for conflict detection", path: ["roleVersion"] });
    }
  });
export type PlatformMember = z.infer<typeof platformMemberSchema>;

export const platformDirectorySchema = z
  .object({
    viewer: platformViewerSchema,
    members: z.array(platformMemberSchema),
    /** All members on the platform; `members` may be a recent subset. */
    totalMembers: count,
    /**
     * When the server built this snapshot. The directory can receive snapshots from a page render
     * and from the directory loader action; it keeps the newest and ignores one that arrives late.
     */
    generatedAt: isoDateTime,
  })
  .superRefine((directory, context) => {
    const ids = new Set<string>();
    directory.members.forEach((member, index) => {
      if (ids.has(member.id)) context.addIssue({ code: "custom", message: "duplicate member id", path: ["members", index, "id"] });
      ids.add(member.id);
      if (member.isViewer !== (member.id === directory.viewer.id)) {
        context.addIssue({ code: "custom", message: "isViewer must match viewer.id", path: ["members", index, "isViewer"] });
      }
    });
    if (directory.totalMembers < directory.members.length) {
      context.addIssue({ code: "custom", message: "totalMembers is smaller than the listed members", path: ["totalMembers"] });
    }
  });
export type PlatformDirectory = z.infer<typeof platformDirectorySchema>;

export interface RoleChangeRequest {
  profileId: string;
  /** The role the viewer saw. The server rejects with ROLE_CONFLICT if it no longer matches. */
  expectedRole: PlatformRole;
  /** The roleVersion the viewer saw. */
  expectedVersion: string;
  nextRole: PlatformRole;
  /**
   * Idempotency key the backend requires: a new UUID for every new intent, reused unchanged when
   * the same intent is retried, so a retried request can never apply twice.
   */
  requestId: string;
}

/** What the page hands the role screens: the role-change Server Action (or nothing, which disables changes). */
export type RoleChangeSubmitter = (request: RoleChangeRequest) => Promise<unknown>;

/** The directory loader Server Action: a fresh, parsed snapshot for the signed-in viewer. */
export type DirectoryLoader = () => Promise<unknown>;

const directoryLoadResultSchema = z.union([
  z.object({ ok: z.literal(true), directory: platformDirectorySchema }),
  z.object({ ok: z.literal(false) }),
]);

/** A loader result the directory can apply, or null when it is unusable (the caller keeps what it shows). */
export function interpretDirectoryLoad(raw: unknown): PlatformDirectory | null {
  const parsed = directoryLoadResultSchema.safeParse(raw);
  return parsed.success && parsed.data.ok ? parsed.data.directory : null;
}

const roleChangeSuccessSchema = z.object({
  ok: z.literal(true),
  /** False when the server found this exact request already applied (a replay). */
  changed: z.boolean(),
  member: z.object({ id: z.uuid(), platformRole: platformRoleSchema, roleVersion: z.string().min(1) }),
});
const roleChangeFailureSchema = z.object({
  ok: z.literal(false),
  code: roleChangeErrorCodeSchema,
  /** For ROLE_CONFLICT: the member's role as the server sees it now. */
  currentRole: platformRoleSchema.optional(),
  retryAfterSeconds: z.number().int().positive().optional(),
});
export const roleChangeResultSchema = z.union([roleChangeSuccessSchema, roleChangeFailureSchema]);

export type RoleChangeOutcome =
  | { ok: true; member: { id: string; platformRole: PlatformRole; roleVersion: string } }
  | { ok: false; code: RoleChangeFailureCode; currentRole?: PlatformRole; retryAfterSeconds?: number };

const auditPartySchema = z.object({ id: z.uuid(), displayName: z.string().nullable(), email: z.string().min(1) });

export const roleAuditEntrySchema = z.object({
  id: z.string().min(1),
  occurredAt: isoDateTime,
  /** Null when the change was made by the platform itself (for example initial owner setup). */
  actor: auditPartySchema.extend({ platformRole: platformRoleSchema }).nullable(),
  target: auditPartySchema,
  fromRole: platformRoleSchema,
  toRole: platformRoleSchema,
  outcome: z.enum(["APPLIED", "REJECTED"]),
  /** Set for REJECTED entries. */
  reason: roleChangeErrorCodeSchema.nullable(),
});
export type RoleAuditEntry = z.infer<typeof roleAuditEntrySchema>;

export const roleAuditFeedSchema = z.union([
  z.object({ status: z.literal("available"), entries: z.array(roleAuditEntrySchema), hasMore: z.boolean() }),
  /** The backend has no audit feed for this viewer. The UI says so and shows no sample records. */
  z.object({ status: z.literal("unavailable") }),
]);
export type RoleAuditFeed = z.infer<typeof roleAuditFeedSchema>;

export type ContractParse<T> = { ok: true; value: T } | { ok: false; issues: string[] };

function toParse<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }): ContractParse<T> {
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, issues: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`) };
}

/**
 * Parse on the server before handing data to client components: unknown fields are stripped,
 * so nothing outside this view model (project roles, tokens, private profile data) reaches the
 * RSC payload even if the backend payload carries it.
 */
export const parsePlatformDirectory = (input: unknown) => toParse(platformDirectorySchema.safeParse(input));
export const parseRoleAuditFeed = (input: unknown) => toParse(roleAuditFeedSchema.safeParse(input));

/**
 * Turns whatever the role-change action returned into an outcome. A success that does not
 * describe the member and role that were requested is not trusted: the UI cannot tell what
 * happened, so it reports CONTRACT_MISMATCH and asks for a refresh instead of guessing.
 * The UI only requests real changes, so a confirmed member is never still at the version the
 * request was based on; a success claiming that is not trusted either.
 */
export function interpretRoleChangeResult(request: RoleChangeRequest, raw: unknown): RoleChangeOutcome {
  const parsed = roleChangeResultSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "CONTRACT_MISMATCH" };
  const result = parsed.data;
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      ...(result.currentRole ? { currentRole: result.currentRole } : {}),
      ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    };
  }
  if (result.member.id !== request.profileId || result.member.platformRole !== request.nextRole || result.member.roleVersion === request.expectedVersion) {
    return { ok: false, code: "CONTRACT_MISMATCH" };
  }
  return { ok: true, member: result.member };
}

/** Next.js signals redirects and not-found through thrown errors; those must keep propagating. */
export function isFrameworkNavigation(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}

/** Calls the server action. A thrown error means the request may or may not have applied. */
export async function performRoleChange(submit: RoleChangeSubmitter, request: RoleChangeRequest): Promise<RoleChangeOutcome> {
  let raw: unknown;
  try {
    raw = await submit(request);
  } catch (error) {
    if (isFrameworkNavigation(error)) throw error;
    return { ok: false, code: "UNKNOWN_OUTCOME" };
  }
  return interpretRoleChangeResult(request, raw);
}
