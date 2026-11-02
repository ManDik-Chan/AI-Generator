/*
 * TEST FIXTURES ONLY. These are hand-written payloads in the shape of the proposed P1-RBAC
 * view model (features/admin/rbac/contract.ts). They are not real users, not real permissions
 * and not output of the backend; nothing in the app imports this file.
 */
import type { PlatformDirectory, PlatformMember, PlatformRole, PlatformViewer, RoleAuditFeed, RoleRestriction } from "@/features/admin/rbac/contract";

export const FIXTURE_IDS = {
  owner: "0f6c2d1e-8a4b-4c3d-9e2f-1a2b3c4d5e60",
  adminA: "1a7d3e2f-9b5c-4d4e-8f30-2b3c4d5e6f71",
  adminB: "2b8e4f30-ac6d-4e5f-9041-3c4d5e6f7082",
  userC: "3c9f5041-bd7e-4f60-a152-4d5e6f708193",
  userD: "4da06152-ce8f-4071-b263-5e6f708192a4",
} as const;

export const LONG_EMAIL = "a.really.long.mailbox.name.for.layout.checks+platform-role-review@subdomain.example-organisation.co.uk";
export const LONG_NAME = "一个非常非常长的昵称用于检查窄屏换行与截断行为不会撑破布局ExtremelyLongNicknameWithoutSpaces";

function member(id: string, role: PlatformRole, viewerId: string, change: { assignable?: PlatformRole[]; restriction?: RoleRestriction | null }, extra: Partial<PlatformMember> = {}): PlatformMember {
  return {
    id,
    email: `${id.slice(0, 8)}@example.test`,
    displayName: null,
    platformRole: role,
    roleVersion: `v1-${id.slice(0, 4)}`,
    joinedAt: "2026-10-01T08:30:00.000Z",
    isViewer: id === viewerId,
    roleChange: { assignableRoles: change.assignable ?? [], restriction: change.restriction ?? null },
    activity: { conversations: 3, personas: 1, memories: 12, toolRuns: 5 },
    ...extra,
  };
}

export const ownerViewer: PlatformViewer = { id: FIXTURE_IDS.owner, platformRole: "OWNER", capabilities: { manageRoles: true, viewRoleAudit: true } };
export const adminViewer: PlatformViewer = { id: FIXTURE_IDS.adminA, platformRole: "ADMIN", capabilities: { manageRoles: false, viewRoleAudit: false } };
export const userViewer: PlatformViewer = { id: FIXTURE_IDS.userC, platformRole: "USER", capabilities: { manageRoles: false, viewRoleAudit: false } };

/** What an OWNER would be sent: may move admins to USER and users to ADMIN; own row protected. */
export function ownerDirectory(): PlatformDirectory {
  const viewerId = ownerViewer.id;
  return {
    viewer: ownerViewer,
    totalMembers: 120,
    members: [
      member(FIXTURE_IDS.owner, "OWNER", viewerId, { restriction: "OWNER_PROTECTED" }, { displayName: "平台负责人" }),
      member(FIXTURE_IDS.adminA, "ADMIN", viewerId, { assignable: ["USER"] }, { displayName: "运营管理员" }),
      member(FIXTURE_IDS.adminB, "ADMIN", viewerId, { assignable: ["USER"] }, { email: LONG_EMAIL }),
      member(FIXTURE_IDS.userC, "USER", viewerId, { assignable: ["ADMIN"] }, { displayName: "普通成员" }),
      member(FIXTURE_IDS.userD, "USER", viewerId, { assignable: ["ADMIN"] }, { displayName: LONG_NAME }),
    ],
  };
}

/** What an ADMIN would be sent: no role changes at all; peers and the owner protected. */
export function adminDirectory(): PlatformDirectory {
  const viewerId = adminViewer.id;
  return {
    viewer: adminViewer,
    totalMembers: 5,
    members: [
      member(FIXTURE_IDS.owner, "OWNER", viewerId, { restriction: "OWNER_PROTECTED" }, { displayName: "平台负责人" }),
      member(FIXTURE_IDS.adminA, "ADMIN", viewerId, { restriction: "SELF" }, { displayName: "运营管理员" }),
      member(FIXTURE_IDS.adminB, "ADMIN", viewerId, { restriction: "PEER_ADMIN" }, { email: LONG_EMAIL }),
      member(FIXTURE_IDS.userC, "USER", viewerId, { restriction: "INSUFFICIENT_ROLE" }, { displayName: "普通成员" }),
      member(FIXTURE_IDS.userD, "USER", viewerId, { restriction: "INSUFFICIENT_ROLE" }, { displayName: LONG_NAME }),
    ],
  };
}

export function auditFeed(): RoleAuditFeed {
  return {
    status: "available",
    hasMore: true,
    entries: [
      {
        id: "audit-2",
        occurredAt: "2026-11-01T02:15:00.000Z",
        actor: { id: FIXTURE_IDS.owner, displayName: "平台负责人", email: "owner@example.test", platformRole: "OWNER" },
        target: { id: FIXTURE_IDS.adminA, displayName: "运营管理员", email: "ops@example.test" },
        fromRole: "USER",
        toRole: "ADMIN",
        outcome: "APPLIED",
        reason: null,
      },
      {
        id: "audit-1",
        occurredAt: "2026-10-31T09:40:00.000Z",
        actor: { id: FIXTURE_IDS.adminA, displayName: "运营管理员", email: "ops@example.test", platformRole: "ADMIN" },
        target: { id: FIXTURE_IDS.adminB, displayName: null, email: LONG_EMAIL },
        fromRole: "ADMIN",
        toRole: "USER",
        outcome: "REJECTED",
        reason: "FORBIDDEN",
      },
      {
        id: "audit-0",
        occurredAt: "2026-10-01T08:30:00.000Z",
        actor: null,
        target: { id: FIXTURE_IDS.owner, displayName: "平台负责人", email: "owner@example.test" },
        fromRole: "USER",
        toRole: "OWNER",
        outcome: "APPLIED",
        reason: null,
      },
    ],
  };
}
