import "server-only";

import type { getAdminOverview } from "@/features/admin/data";
import { roleChangeInputSchema, type RoleChangeDecision } from "@/features/admin/role-contract";
import {
  parsePlatformDirectory,
  type ContractParse,
  type PlatformDirectory,
  type PlatformRole,
  type RoleAuditFeed,
  type RoleRestriction,
} from "@/features/admin/rbac/contract";

/*
 * Server-side adapter from the P1-RBAC backend (features/admin/data.ts, role-contract.ts) to the
 * view model the /admin role screens render (features/admin/rbac/contract.ts). Every
 * authorization fact comes from the backend's own decision for the signed-in viewer; nothing here
 * grants anything the backend did not. The result is parsed before it reaches client props, so
 * fields outside the view model are dropped.
 *
 * The database now supplies the version; the page remains read-only until the
 * role-change action is explicitly connected during the frontend integration.
 */

type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
export type PlatformDirectorySource = Pick<AdminOverview, "actor" | "actorCapabilities" | "users">;

/** Target roles the backend role-change action accepts (its input schema), in its order. */
const ACCEPTED_TARGET_ROLES: readonly PlatformRole[] = roleChangeInputSchema.shape.nextRole.options;

/** Display reason for a member the backend does not let this viewer change. */
export function restrictionFor(decision: RoleChangeDecision, viewerRole: PlatformRole, targetRole: PlatformRole): RoleRestriction | null {
  if (decision.allowed) return null;
  switch (decision.code) {
    case "SELF_CHANGE":
      return "SELF";
    case "OWNER_PROTECTED":
      return "OWNER_PROTECTED";
    case "FORBIDDEN":
      return viewerRole === "ADMIN" && targetRole === "ADMIN" ? "PEER_ADMIN" : "INSUFFICIENT_ROLE";
    default:
      // The advisory decision never returns request-level codes; treat anything else as "no rights".
      return "INSUFFICIENT_ROLE";
  }
}

export function toPlatformDirectory(source: PlatformDirectorySource): ContractParse<PlatformDirectory> {
  const { actor, actorCapabilities, users } = source;
  return parsePlatformDirectory({
    viewer: {
      id: actor.id,
      platformRole: actor.platformRole,
      capabilities: {
        manageRoles: actorCapabilities.canManageAdminRoles,
        // The backend records role changes but has no audit read endpoint or read capability yet.
        viewRoleAudit: false,
      },
    },
    totalMembers: users.total,
    members: users.items.map((item) => {
      const roleVersion = String(item.roleVersion);
      const offered = item.roleChange.allowed;
      return {
        id: item.id,
        email: item.email,
        displayName: item.displayName,
        platformRole: item.role,
        roleVersion,
        joinedAt: item.createdAt.toISOString(),
        isViewer: item.id === actor.id,
        roleChange: {
          assignableRoles: offered ? ACCEPTED_TARGET_ROLES.filter((role) => role !== item.role) : [],
          restriction: restrictionFor(item.roleChange, actor.platformRole, item.role),
        },
        activity: {
          conversations: item._count.conversations,
          personas: item._count.personas,
          memories: item._count.memories,
          toolRuns: item._count.toolRuns,
        },
      };
    }),
  });
}

/** No audit read endpoint exists; the page says so instead of showing anything. */
export const ROLE_AUDIT_FEED_NOT_CONNECTED: RoleAuditFeed = { status: "unavailable" };
