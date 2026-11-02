/*
 * The adapter from the P1-RBAC backend to the /admin role screens. Inputs are built with the
 * backend's own decision functions (canChangePlatformRole, platformCapabilities), not hand-written
 * view-model fixtures, so these tests follow the backend policy if it changes.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it } from "vitest";

import { PlatformRolesSection } from "@/features/admin/components/platform-roles-section";
import { canChangePlatformRole, platformCapabilities, type PlatformRole } from "@/features/admin/role-contract";
import { ROLE_AUDIT_FEED_NOT_CONNECTED, restrictionFor, toPlatformDirectory, type PlatformDirectorySource } from "@/features/admin/rbac/server-directory";

const people = {
  owner: { id: "0f6c2d1e-8a4b-4c3d-9e2f-1a2b3c4d5e60", role: "OWNER" },
  adminA: { id: "1a7d3e2f-9b5c-4d4e-8f30-2b3c4d5e6f71", role: "ADMIN" },
  adminB: { id: "2b8e4f30-ac6d-4e5f-9041-3c4d5e6f7082", role: "ADMIN" },
  userC: { id: "3c9f5041-bd7e-4f60-a152-4d5e6f708193", role: "USER" },
} as const satisfies Record<string, { id: string; role: PlatformRole }>;
type Person = keyof typeof people;

function backendOverview(viewer: Person): PlatformDirectorySource {
  const viewerRole = people[viewer].role;
  return {
    actor: { id: people[viewer].id, platformRole: viewerRole },
    actorCapabilities: platformCapabilities(viewerRole),
    users: {
      items: (Object.keys(people) as Person[]).map((key, index) => ({
        id: people[key].id,
        email: `${key}@example.test`,
        displayName: key === "adminB" ? null : `成员 ${key}`,
        role: people[key].role,
        createdAt: new Date(Date.UTC(2026, 9, 1 + index, 8, 30)),
        _count: { conversations: 2, personas: 1, memories: 4, toolRuns: 3 },
        roleChange: canChangePlatformRole(viewerRole, people[key].role, key === viewer),
      })),
      total: 12,
      admins: 3,
      limit: 50,
    },
  };
}

function parsed(viewer: Person) {
  const result = toPlatformDirectory(backendOverview(viewer));
  if (!result.ok) throw new Error(result.issues.join("\n"));
  return result.value;
}
const member = (directory: ReturnType<typeof parsed>, key: Person) => directory.members.find((item) => item.id === people[key].id)!;

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const renderSection = (viewer: Person) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
  createElement(PlatformRolesSection, { audit: ROLE_AUDIT_FEED_NOT_CONNECTED, directory: parsed(viewer) })));

describe("backend to view-model mapping", () => {
  it("maps the OWNER viewer's capabilities from the backend and reports no audit read capability", () => {
    const directory = parsed("owner");
    expect(directory.viewer).toEqual({ id: people.owner.id, platformRole: "OWNER", capabilities: { manageRoles: true, viewRoleAudit: false } });
    expect(directory.totalMembers).toBe(12);
    expect(member(directory, "owner")).toMatchObject({ isViewer: true, roleChange: { assignableRoles: [], restriction: "SELF" } });
  });

  it("offers no change and invents no version while the backend has no role version", () => {
    const directory = parsed("owner");
    // The backend allows OWNER to change these members, but without a version the change cannot be
    // conflict-checked, so it is not offered and nothing claims a version.
    for (const key of ["adminA", "adminB", "userC"] as const) {
      expect(canChangePlatformRole("OWNER", people[key].role, false).allowed).toBe(true);
      expect(member(directory, key)).toMatchObject({ roleVersion: null, roleChange: { assignableRoles: [], restriction: null } });
    }
  });

  it("explains every protection an ADMIN viewer sees with the backend's reason", () => {
    const directory = parsed("adminA");
    expect(directory.viewer.capabilities).toEqual({ manageRoles: false, viewRoleAudit: false });
    expect(member(directory, "owner").roleChange.restriction).toBe("OWNER_PROTECTED");
    expect(member(directory, "adminA").roleChange.restriction).toBe("SELF");
    expect(member(directory, "adminB").roleChange.restriction).toBe("PEER_ADMIN");
    expect(member(directory, "userC").roleChange.restriction).toBe("INSUFFICIENT_ROLE");
    expect(directory.members.every((item) => item.roleChange.assignableRoles.length === 0)).toBe(true);
  });

  it("maps request-level codes the advisory check never returns to no rights", () => {
    expect(restrictionFor({ allowed: false, code: "CONFLICT", reason: "x" }, "OWNER", "USER")).toBe("INSUFFICIENT_ROLE");
    expect(restrictionFor({ allowed: true }, "OWNER", "USER")).toBeNull();
  });

  it("keeps only view-model fields, with dates as ISO strings", () => {
    const source = backendOverview("owner");
    const leaky = { ...source, users: { ...source.users, items: source.users.items.map((item) => ({ ...item, updatedAt: new Date(), projectRoles: ["OWNER"], storagePath: "private/path" })) } };
    const result = toPlatformDirectory(leaky as PlatformDirectorySource);
    expect(result.ok).toBe(true);
    const json = JSON.stringify(result.ok && result.value);
    for (const leaked of ["updatedAt", "projectRoles", "storagePath", "_count", "createdAt"]) expect(json).not.toContain(leaked);
    expect(result.ok && result.value.members[0]).toMatchObject({ joinedAt: "2026-10-01T08:30:00.000Z", activity: { conversations: 2, personas: 1, memories: 4, toolRuns: 3 } });
  });

  it("fails closed when the backend sends a role outside the contract", () => {
    const source = backendOverview("owner");
    source.users.items[1] = { ...source.users.items[1], role: "SUPERADMIN" as PlatformRole };
    expect(toPlatformDirectory(source).ok).toBe(false);
  });
});

describe("/admin role section from backend data", () => {
  it("shows an OWNER a read-only directory that says role changes and the audit feed are not connected", () => {
    const html = renderSection("owner");
    expect(text(html)).toContain("角色调整暂不可用");
    expect(html).not.toContain("更改角色");
    expect(text(html)).toContain("有权调整平台角色，但角色调整入口暂未接入");
    expect(text(html)).toContain("角色变更记录暂未接入");
    expect(html).toContain('data-audit-state="unavailable"');
    expect(html).not.toContain("<ol");
    expect(html).not.toContain('data-allowed="true"');
  });

  it("shows an ADMIN the protections and no change controls", () => {
    const html = renderSection("adminA");
    expect(text(html)).not.toContain("角色调整暂不可用");
    expect(html).not.toContain("更改角色");
    expect(text(html)).toContain("不能调整平台角色");
    expect(html).toContain('data-restriction="PEER_ADMIN"');
    expect(html).toContain('data-restriction="OWNER_PROTECTED"');
    expect(html).toContain('data-restriction="SELF"');
    expect(html).not.toContain('data-restriction="INSUFFICIENT_ROLE"');
    expect(html).toContain('data-audit-state="unavailable"');
  });

  it("labels the OWNER row as platform owner, not admin or user", () => {
    const html = renderSection("adminA");
    const start = html.indexOf(`data-member-id="${people.owner.id}"`);
    expect(html.slice(start, html.indexOf("</li>", start))).toContain('data-platform-role="OWNER"');
  });
});
