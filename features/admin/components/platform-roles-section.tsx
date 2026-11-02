import { SectionHeader } from "@/components/ui/page-header";
import { StatusBanner } from "@/components/ui/status-banner";
import { PlatformMemberDirectory } from "@/features/admin/components/platform-member-directory";
import { RoleAuditLog } from "@/features/admin/components/role-audit-log";
import { ViewerAccessCard } from "@/features/admin/components/viewer-access-card";
import type { PlatformDirectory, RoleAuditFeed, RoleChangeSubmitter } from "@/features/admin/rbac/contract";

/*
 * The 用户与角色 block of /admin for the OWNER / ADMIN / USER model. Pass data that already went
 * through parsePlatformDirectory / parseRoleAuditFeed on the server. Access to /admin itself is
 * decided by the server; this component only fails closed if it is ever handed a USER viewer.
 */
export function PlatformRolesSection({ directory, audit, onChangeRole }: { directory: PlatformDirectory; audit?: RoleAuditFeed; onChangeRole?: RoleChangeSubmitter }) {
  const { viewer } = directory;
  if (viewer.platformRole === "USER") {
    return (
      <section aria-labelledby="users-title" className="mt-9">
        <SectionHeader id="users-title" kicker="权限管理" title="用户与角色" />
        <StatusBanner className="mt-4" title="没有平台管理权限" variant="warning">你的平台角色是普通用户，不能查看或调整其他用户的角色。</StatusBanner>
      </section>
    );
  }

  return (
    <>
      <section aria-labelledby="users-title" className="mt-9">
        <SectionHeader description="角色、可执行的调整和不可调整的原因都由服务端按当前登录身份给出；每次调整提交时服务端会再次校验。" id="users-title" kicker="权限管理" title="用户与角色" />
        <div className="mt-4 grid gap-4">
          <ViewerAccessCard viewer={viewer} />
          <PlatformMemberDirectory members={directory.members} onChangeRole={onChangeRole} totalMembers={directory.totalMembers} viewer={viewer} />
        </div>
      </section>

      {viewer.capabilities.viewRoleAudit ? (
        <section aria-labelledby="role-audit-title" className="mt-9">
          <SectionHeader description="只记录平台角色调整：执行人、对象、调整前后的角色、时间和结果。" id="role-audit-title" kicker="审计" title="角色变更记录" />
          <div className="mt-4"><RoleAuditLog feed={audit ?? { status: "unavailable" }} /></div>
        </section>
      ) : null}
    </>
  );
}
