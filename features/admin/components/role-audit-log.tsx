import { ArrowRight, History } from "lucide-react";

import { PlatformRoleBadge } from "@/features/admin/components/platform-role-badge";
import type { RoleAuditEntry, RoleAuditFeed } from "@/features/admin/rbac/contract";
import { describeRoleChange, formatAdminDateTime, memberName, PLATFORM_ROLE_LABEL, roleChangeFailureCopy } from "@/features/admin/rbac/copy";
import { cn } from "@/lib/utils";

/*
 * Role-change audit: who changed whose platform role, from what to what, when, and whether it
 * applied. Entries carry names and emails only; no conversations, credentials or keys exist in
 * the contract, so none can be shown. Without a real feed it says so and shows no sample rows.
 */
export function RoleAuditLog({ feed }: { feed: RoleAuditFeed }) {
  if (feed.status === "unavailable") {
    return (
      <div className="premium-panel flex items-start gap-3 p-4 text-sm sm:p-5" data-audit-state="unavailable">
        <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-semibold">角色变更记录暂未接入</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">服务端审计接口可用后，这里会显示真实记录。在此之前不显示任何示例记录。</p>
        </div>
      </div>
    );
  }
  if (!feed.entries.length) {
    return <div className="premium-panel p-6 text-center text-sm text-muted-foreground" data-audit-state="empty">还没有角色变更记录。</div>;
  }
  return (
    <div className="grid gap-2.5">
      <ol aria-label="角色变更记录" className="grid gap-2.5">
        {feed.entries.map((entry) => <AuditEntry entry={entry} key={entry.id} />)}
      </ol>
      {feed.hasMore ? <p className="text-xs text-muted-foreground">仅显示最近 {feed.entries.length} 条记录。</p> : null}
    </div>
  );
}

function AuditEntry({ entry }: { entry: RoleAuditEntry }) {
  const applied = entry.outcome === "APPLIED";
  const actor = entry.actor ? memberName(entry.actor) : "系统";
  const target = memberName(entry.target);
  const { verb } = describeRoleChange(entry.fromRole, entry.toRole);
  return (
    <li className="premium-panel grid min-w-0 gap-2 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-6" data-outcome={entry.outcome}>
      <div className="min-w-0">
        <p className="overflow-wrap-anywhere text-sm leading-6">
          <strong className="font-semibold">{actor}</strong>
          {entry.actor ? <span className="text-muted-foreground">（{PLATFORM_ROLE_LABEL[entry.actor.platformRole]}）</span> : null}
          {applied ? " " : " 尝试"}
          {verb}：<strong className="font-semibold">{target}</strong>
        </p>
        {entry.target.displayName?.trim() ? <p className="overflow-wrap-anywhere text-xs text-muted-foreground">{entry.target.email}</p> : null}
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <PlatformRoleBadge role={entry.fromRole} />
          <ArrowRight aria-label="调整为" className="size-3.5" role="img" />
          <PlatformRoleBadge role={entry.toRole} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:flex-col md:items-end">
        <span className={cn("premium-chip", applied ? "border-success/15 bg-success-subtle text-success-foreground" : "border-destructive/15 bg-destructive-subtle text-destructive-foreground")}>
          {applied ? "已生效" : `未生效${entry.reason ? ` · ${roleChangeFailureCopy(entry.reason).title}` : ""}`}
        </span>
        <time className="text-xs tabular-nums text-muted-foreground" dateTime={entry.occurredAt}>{formatAdminDateTime(entry.occurredAt)}</time>
      </div>
    </li>
  );
}
