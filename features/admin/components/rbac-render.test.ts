/*
 * Server-renders the platform-role screens in Node. Local browser automation is suspended for
 * this repository (AGENTS.md), so this checks markup, permission visibility and feedback states;
 * it does not check layout, focus movement or dark-mode appearance in a real browser.
 */
import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it } from "vitest";

import { filterMembers, MemberDirectoryView, type MemberDirectoryViewProps } from "@/features/admin/components/member-directory-view";
import { PlatformRolesSection } from "@/features/admin/components/platform-roles-section";
import { RoleAuditLog } from "@/features/admin/components/role-audit-log";
import { RoleChangeDialogView } from "@/features/admin/components/role-change-dialog-view";
import { ViewerAccessCard } from "@/features/admin/components/viewer-access-card";
import { parseRoleAuditFeed, type PlatformDirectory, type PlatformMember } from "@/features/admin/rbac/contract";
import { directoryReducer, initialDirectoryState, type DirectoryEvent, type DirectoryState } from "@/features/admin/rbac/role-change-state";
import { adminDirectory, adminViewer, auditFeed, FIXTURE_IDS, LONG_EMAIL, LONG_NAME, ownerDirectory, userViewer } from "@/tests/fixtures/admin-rbac";

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const render = (element: ReactElement) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, element));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const submitter = async () => ({ ok: false, code: "UNAVAILABLE" });
const run = (state: DirectoryState, ...events: DirectoryEvent[]) => events.reduce(directoryReducer, state);
const find = (directory: PlatformDirectory, id: string) => directory.members.find((member) => member.id === id)!;

function directoryView(directory: PlatformDirectory, overrides: Partial<MemberDirectoryViewProps> = {}) {
  return render(createElement(MemberDirectoryView, {
    viewer: directory.viewer,
    members: directory.members,
    totalMembers: directory.totalMembers,
    state: initialDirectoryState(directory.members),
    changesEnabled: directory.viewer.capabilities.manageRoles,
    query: "",
    roleFilter: "ALL",
    loginHref: "/login?next=%2Fadmin",
    onRefresh() {},
    ...overrides,
  }));
}

/** The markup of one row, located by its data attribute. */
function row(html: string, id: string) {
  const start = html.indexOf(`data-member-id="${id}"`);
  const end = html.indexOf("</li>", start);
  return html.slice(start, end);
}

describe("OWNER view", () => {
  const directory = ownerDirectory();

  it("states the platform owner identity and what this session may do", () => {
    const html = render(createElement(ViewerAccessCard, { viewer: directory.viewer }));
    expect(text(html)).toContain("你的平台身份");
    expect(html).toContain('data-platform-role="OWNER"');
    expect(text(html)).toContain("平台所有者");
    expect(count(html, 'data-allowed="true"')).toBe(2);
    expect(text(html)).toContain("项目所有者");
  });

  it("offers a change only where the server listed assignable roles", () => {
    const html = directoryView(directory);
    expect(count(html, "更改角色")).toBe(4);
    expect(row(html, FIXTURE_IDS.owner)).not.toContain("更改角色");
    expect(row(html, FIXTURE_IDS.owner)).toContain("所有者角色受保护");
    expect(row(html, FIXTURE_IDS.owner)).toContain(">你<");
    expect(row(html, FIXTURE_IDS.adminA)).toContain("更改角色<span class=\"sr-only\">：运营管理员</span>");
  });

  it("wraps long emails and nicknames instead of widening the row", () => {
    const html = directoryView(directory);
    expect(row(html, FIXTURE_IDS.adminB)).toMatch(new RegExp(`overflow-wrap-anywhere[^>]*>${LONG_EMAIL.replace(/[.+]/g, "\\$&")}<`));
    expect(row(html, FIXTURE_IDS.userD)).toMatch(new RegExp(`overflow-wrap-anywhere[^>]*>${LONG_NAME}<`));
  });

  it("counts loaded members honestly when the list is a subset", () => {
    const html = directoryView(directory);
    expect(text(html)).toContain("已加载最近 5 名，共 120 名用户");
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows the audit section, and says so when the feed is not connected", () => {
    const html = render(createElement(PlatformRolesSection, { directory, onChangeRole: submitter }));
    expect(text(html)).toContain("角色变更记录");
    expect(html).toContain('data-audit-state="unavailable"');
    expect(html).not.toContain("<ol");
  });
});

describe("ADMIN view", () => {
  const directory = adminDirectory();

  it("never offers a role change when the server offers none", () => {
    const html = render(createElement(PlatformRolesSection, { directory, onChangeRole: submitter }));
    expect(html).not.toContain("更改角色");
    expect(text(html)).toContain("不能调整平台角色");
    expect(text(html)).toContain("任免管理员和调整其他管理员由平台所有者负责");
  });

  it("explains protection on peer admin, own and owner rows without repeating it on every user", () => {
    const html = directoryView(directory, { changesEnabled: false });
    expect(row(html, FIXTURE_IDS.adminB)).toContain("仅平台所有者可调整");
    expect(row(html, FIXTURE_IDS.adminB)).toContain("管理员之间不能互相调整角色或账户状态");
    expect(row(html, FIXTURE_IDS.adminA)).toContain("不能修改自己的角色");
    expect(row(html, FIXTURE_IDS.owner)).toContain("所有者角色受保护");
    expect(row(html, FIXTURE_IDS.userC)).not.toContain("data-restriction");
  });

  it("hides the audit section without the audit capability", () => {
    const html = render(createElement(PlatformRolesSection, { directory, audit: auditFeed() }));
    expect(html).not.toContain('id="role-audit-title"');
    expect(html).not.toContain("data-outcome");
  });

  it("follows the server if it does offer an ADMIN a change on a user", () => {
    const changed = adminDirectory();
    changed.viewer = { ...adminViewer, capabilities: { manageRoles: true, viewRoleAudit: false } };
    const userC = find(changed, FIXTURE_IDS.userC);
    userC.roleChange = { assignableRoles: ["ADMIN"], restriction: null };
    const html = directoryView(changed, { changesEnabled: true });
    expect(count(html, "更改角色")).toBe(1);
    expect(row(html, FIXTURE_IDS.userC)).toContain("更改角色");
    // With some management rights, a plain "no rights here" is shown per row.
    expect(row(html, FIXTURE_IDS.userD)).toContain("无权调整");
  });
});

describe("USER and unwired states", () => {
  it("renders no directory, controls or audit for a USER viewer", () => {
    const html = render(createElement(PlatformRolesSection, { directory: { viewer: userViewer, members: ownerDirectory().members.map((member) => ({ ...member, isViewer: member.id === userViewer.id })), totalMembers: 5 }, audit: auditFeed(), onChangeRole: submitter }));
    expect(text(html)).toContain("没有平台管理权限");
    expect(html).not.toContain("更改角色");
    expect(html).not.toContain("data-member-id");
    expect(html).not.toContain('id="role-audit-title"');
  });

  it("is read-only and says why when no role-change action is wired", () => {
    const html = render(createElement(PlatformRolesSection, { directory: ownerDirectory() }));
    expect(text(html)).toContain("角色调整暂不可用");
    expect(html).not.toContain("更改角色");
  });
});

describe("row feedback", () => {
  const directory = ownerDirectory();
  const userC = find(directory, FIXTURE_IDS.userC);
  const opened = run(initialDirectoryState(directory.members), { type: "open", member: userC }, { type: "submit" });

  it("keeps an empty live region on every row", () => {
    const html = directoryView(directory);
    expect(count(html, 'role="status"')).toBe(directory.members.length + 1);
  });

  it("shows the confirmed role and a locked trigger while syncing", () => {
    const state = run(opened, { type: "resolved", outcome: { ok: true, member: { id: userC.id, platformRole: "ADMIN", roleVersion: "v2" } } });
    const html = row(directoryView(directory, { state }), userC.id);
    expect(html).toContain('data-platform-role="ADMIN"');
    expect(html).toContain('aria-disabled="true"');
    expect(text(html)).toContain("已授予平台管理员，正在同步最新权限");
    expect(text(html)).toContain("刷新最新状态");
  });

  it("explains a conflict with the server's current role and offers a refresh", () => {
    const state = run(opened, { type: "resolved", outcome: { ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN" } });
    const html = row(directoryView(directory, { state }), userC.id);
    expect(text(html)).toContain("角色已被他人修改");
    expect(text(html)).toContain("这位用户现在是平台管理员");
    expect(html).toContain('aria-disabled="true"');
    expect(text(html)).toContain("刷新最新状态");
  });

  it("sends an expired session to sign-in and back to /admin", () => {
    const state = run(opened, { type: "resolved", outcome: { ok: false, code: "UNAUTHENTICATED" } });
    const html = row(directoryView(directory, { state }), userC.id);
    expect(text(html)).toContain("登录已过期");
    expect(html).toContain('href="/login?next=%2Fadmin"');
  });

  it("filters by name, email and role, keeping a row that is mid-change", () => {
    const fresh = initialDirectoryState(directory.members);
    expect(filterMembers(directory.members, fresh, "运营", "ALL").map((member) => member.id)).toEqual([FIXTURE_IDS.adminA]);
    expect(filterMembers(directory.members, fresh, "SUBDOMAIN.EXAMPLE", "ALL").map((member) => member.id)).toEqual([FIXTURE_IDS.adminB]);
    expect(filterMembers(directory.members, fresh, "", "ADMIN")).toHaveLength(2);
    expect(filterMembers(directory.members, opened, "", "OWNER").map((member) => member.id)).toContain(FIXTURE_IDS.userC);
    expect(text(directoryView(directory, { query: "nobody" }))).toContain("没有符合筛选条件的用户");
  });
});

describe("role change dialog", () => {
  const directory = ownerDirectory();
  const adminA = find(directory, FIXTURE_IDS.adminA);
  const userC = find(directory, FIXTURE_IDS.userC);
  const dialog = (member: PlatformMember, ...events: DirectoryEvent[]) => {
    const state = run(initialDirectoryState(directory.members), { type: "open", member }, ...events);
    return render(createElement(RoleChangeDialogView, { member, session: state.session, loginHref: "/login?next=%2Fadmin", onRefresh() {} }));
  };

  it("shows the member, current role, consequence and a specific confirm label", () => {
    const html = dialog(userC);
    expect(text(html)).toContain("调整平台角色");
    expect(text(html)).toContain("普通成员");
    expect(text(html)).toContain("权限将扩大");
    expect(text(html)).toContain("确认授予管理员");
    expect(html).toMatch(/<input[^>]*checked[^>]*value="ADMIN"|<input[^>]*value="ADMIN"[^>]*checked/);
  });

  it("frames revoking an admin as a reduction", () => {
    const html = dialog(adminA);
    expect(text(html)).toContain("权限将收回");
    expect(text(html)).toContain("确认撤销管理员");
  });

  it("disables the choices and announces saving", () => {
    const html = dialog(userC, { type: "submit" });
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(text(html)).toContain("正在保存");
    expect(html).not.toContain("权限将扩大");
  });

  it("lets a retryable failure be confirmed again", () => {
    const html = dialog(userC, { type: "submit" }, { type: "resolved", outcome: { ok: false, code: "UNAVAILABLE" } });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("暂时无法保存");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*type="submit"/);
  });

  it("blocks confirming after a conflict and offers the latest state", () => {
    const html = dialog(userC, { type: "submit" }, { type: "resolved", outcome: { ok: false, code: "ROLE_CONFLICT", currentRole: "ADMIN" } });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("刷新最新状态");
    expect(text(html)).toContain(" 关闭 ");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/);
  });

  it("explains a forbidden result and an expired session", () => {
    expect(text(dialog(userC, { type: "submit" }, { type: "resolved", outcome: { ok: false, code: "FORBIDDEN" } }))).toContain("你的权限已变化");
    expect(dialog(userC, { type: "submit" }, { type: "resolved", outcome: { ok: false, code: "UNAUTHENTICATED" } })).toContain('href="/login?next=%2Fadmin"');
  });

  it("says the member changed under the dialog", () => {
    const promoted = { ...userC, platformRole: "ADMIN" as const, roleVersion: "v7", roleChange: { assignableRoles: ["USER" as const], restriction: null } };
    const state = run(initialDirectoryState(directory.members), { type: "open", member: userC }, { type: "serverData", members: directory.members.map((member) => (member.id === userC.id ? promoted : member)) });
    const html = render(createElement(RoleChangeDialogView, { member: promoted, session: state.session, loginHref: "/login" }));
    expect(text(html)).toContain("角色已从普通用户变为平台管理员");
  });
});

describe("role audit log", () => {
  it("shows actor, target, roles before and after, time and outcome", () => {
    const html = render(createElement(RoleAuditLog, { feed: auditFeed() }));
    const visible = text(html);
    expect(visible).toContain("平台负责人 （平台所有者） 授予平台管理员： 运营管理员");
    expect(visible).toContain("尝试撤销平台管理员");
    expect(visible).toContain("未生效 · 你的权限已变化");
    expect(visible).toContain("系统");
    expect(html).toContain('dateTime="2026-11-01T02:15:00.000Z"');
    expect(visible).toContain("2026/11/01 10:15");
    expect(visible).toContain("仅显示最近 3 条记录");
    expect(count(html, 'data-outcome="APPLIED"')).toBe(2);
  });

  it("does not render fields the contract strips", () => {
    const raw = auditFeed() as unknown as { entries: Array<Record<string, unknown>> };
    raw.entries[0].conversationExcerpt = "private conversation";
    const parsed = parseRoleAuditFeed(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(render(createElement(RoleAuditLog, { feed: parsed.value }))).not.toContain("private conversation");
  });

  it("distinguishes an empty feed from an unconnected one", () => {
    expect(render(createElement(RoleAuditLog, { feed: { status: "available", entries: [], hasMore: false } }))).toContain('data-audit-state="empty"');
    expect(render(createElement(RoleAuditLog, { feed: { status: "unavailable" } }))).toContain("不显示任何示例记录");
  });
});

describe("source guards", () => {
  const files = ["platform-role-badge", "viewer-access-card", "member-directory-view", "role-change-dialog-view", "platform-member-directory", "role-audit-log", "platform-roles-section"]
    .map((name) => [name, readFileSync(`features/admin/components/${name}.tsx`, "utf8")] as const);

  it("uses theme tokens only, so dark mode follows the design system", () => {
    for (const [, source] of files) expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(?:bg|text|border)-(?:white|black|gray|slate|zinc|neutral)\b/);
  });

  it("does not read project roles or ship fixtures", () => {
    for (const [, source] of files) {
      expect(source).not.toMatch(/ProjectRole|projectRoles|tests\/fixtures|mock/i);
    }
  });
});
