import { Lock, RefreshCw, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { PlatformRoleBadge } from "@/features/admin/components/platform-role-badge";
import { PLATFORM_ROLES, type PlatformMember, type PlatformRole, type PlatformViewer } from "@/features/admin/rbac/contract";
import { describeRoleChange, formatAdminDate, memberName, PLATFORM_ROLE_LABEL, RESTRICTION_COPY, roleChangeFailureCopy, rowRestrictionVisible } from "@/features/admin/rbac/copy";
import { displayedRole, isRowLocked, type DirectoryState, type RowNotice } from "@/features/admin/rbac/role-change-state";
import { cn } from "@/lib/utils";

export type RoleFilter = PlatformRole | "ALL";

export interface MemberDirectoryViewProps {
  viewer: PlatformViewer;
  members: PlatformMember[];
  totalMembers: number;
  state: DirectoryState;
  /** False when the viewer cannot manage roles or no role-change action is wired. */
  changesEnabled: boolean;
  query: string;
  roleFilter: RoleFilter;
  loginHref: string;
  onQueryChange?(query: string): void;
  onRoleFilterChange?(filter: RoleFilter): void;
  onOpen?(member: PlatformMember): void;
  onRefresh?(): void;
  registerTrigger?(memberId: string, element: HTMLButtonElement | null): void;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase("zh-CN");

export function filterMembers(members: PlatformMember[], state: DirectoryState, query: string, roleFilter: RoleFilter) {
  const needle = normalize(query);
  return members.filter((member) => {
    // A row that is mid-change stays put so its result is not filtered out of view.
    if (state.session?.memberId === member.id || isRowLocked(state.notices[member.id])) return true;
    const role = displayedRole(member, state.notices[member.id]);
    if (roleFilter !== "ALL" && role !== roleFilter) return false;
    if (!needle) return true;
    return normalize(member.email).includes(needle) || normalize(member.displayName ?? "").includes(needle);
  });
}

function noticeContent(notice: RowNotice | undefined) {
  if (!notice) return null;
  if (notice.kind === "applied") {
    const { verb } = describeRoleChange(notice.fromRole, notice.toRole);
    return notice.synced
      ? { tone: "success" as const, text: `已${verb}。` }
      : { tone: "success" as const, text: `已${verb}，正在同步最新权限…` };
  }
  const copy = roleChangeFailureCopy(notice.code, notice);
  if (notice.locked) return { tone: "error" as const, text: `${copy.title}：${copy.body}` };
  return { tone: "muted" as const, text: copy.nothingChanged ? `上次调整未执行（${copy.title}），已显示最新状态。` : "上次调整的结果未能确认，已显示最新状态。" };
}

export function MemberDirectoryView(props: MemberDirectoryViewProps) {
  const { viewer, members, totalMembers, state, changesEnabled, query, roleFilter } = props;
  const visible = filterMembers(members, state, query, roleFilter);
  const counts = Object.fromEntries(PLATFORM_ROLES.map((role) => [role, members.filter((member) => displayedRole(member, state.notices[member.id]) === role).length])) as Record<PlatformRole, number>;
  const filtered = Boolean(normalize(query)) || roleFilter !== "ALL";

  return (
    <div className="grid gap-4">
      {viewer.capabilities.manageRoles && !changesEnabled
        ? <StatusBanner title="角色调整暂不可用" variant="warning">服务端当前没有提供角色调整入口，列表只供查看。</StatusBanner>
        : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative min-w-0 md:w-72">
          <label className="sr-only" htmlFor="member-search">按昵称或邮箱筛选已加载的用户</label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoComplete="off"
            className="premium-field h-10 pl-9 pr-3 text-sm"
            id="member-search"
            onChange={(event) => props.onQueryChange?.(event.target.value)}
            placeholder="按昵称或邮箱筛选"
            type="search"
            value={query}
          />
        </div>
        <div aria-label="按平台角色筛选" className="flex flex-wrap gap-1.5" role="group">
          {(["ALL", ...PLATFORM_ROLES] as const).map((filter) => (
            <button
              aria-pressed={roleFilter === filter}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                roleFilter === filter ? "border-foreground bg-foreground text-background" : "border-border/14 text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              )}
              key={filter}
              onClick={() => props.onRoleFilterChange?.(filter)}
              type="button"
            >
              {filter === "ALL" ? "全部" : PLATFORM_ROLE_LABEL[filter]}
              <span className="ml-1.5 tabular-nums opacity-70">{filter === "ALL" ? members.length : counts[filter]}</span>
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
        {filtered ? `筛选出 ${visible.length} 名 · ` : ""}已加载最近 {members.length} 名{totalMembers > members.length ? `，共 ${totalMembers} 名用户` : "用户"}
      </p>

      {visible.length ? (
        <ul aria-label="平台用户" className="grid gap-2.5">
          {visible.map((member) => <MemberRow {...props} key={member.id} member={member} />)}
        </ul>
      ) : (
        <div className="premium-panel grid place-items-center gap-3 p-8 text-center text-sm text-muted-foreground">
          <p>{members.length ? "没有符合筛选条件的用户。" : "还没有用户。"}</p>
          {filtered ? <Button onClick={() => { props.onQueryChange?.(""); props.onRoleFilterChange?.("ALL"); }} size="sm" variant="outline">清除筛选</Button> : null}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, viewer, state, changesEnabled, loginHref, onOpen, onRefresh, registerTrigger }: MemberDirectoryViewProps & { member: PlatformMember }) {
  const notice = state.notices[member.id];
  const locked = isRowLocked(notice);
  const role = displayedRole(member, notice);
  const name = memberName(member);
  const offersChange = changesEnabled && member.roleChange.assignableRoles.length > 0;
  const restriction = member.roleChange.restriction;
  const showRestriction = !offersChange && rowRestrictionVisible(restriction, viewer);
  const content = noticeContent(notice);
  const noticeId = `member-notice-${member.id}`;
  const recovery = notice?.kind === "rejected" && notice.locked ? roleChangeFailureCopy(notice.code).recovery : notice?.kind === "applied" && !notice.synced ? "refresh" : null;

  return (
    <li
      aria-busy={state.session?.memberId === member.id && state.session.status === "saving" ? true : undefined}
      className="premium-panel grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-6"
      data-member-id={member.id}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 overflow-wrap-anywhere text-sm font-semibold">{name}</p>
          {member.isViewer ? <span className="premium-chip min-h-0 py-0.5">你</span> : null}
          <PlatformRoleBadge role={role} />
        </div>
        {member.displayName?.trim() ? <p className="mt-1 overflow-wrap-anywhere text-xs text-muted-foreground">{member.email}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">
          加入于 <time dateTime={member.joinedAt}>{formatAdminDate(member.joinedAt)}</time>
          {member.activity ? <span className="tabular-nums"> · 对话 {member.activity.conversations} · 人格 {member.activity.personas} · 记忆 {member.activity.memories} · 运行 {member.activity.toolRuns}</span> : null}
        </p>
      </div>

      {offersChange || showRestriction ? <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
        {offersChange ? (
          <Button
            aria-describedby={content ? noticeId : undefined}
            aria-disabled={locked || undefined}
            aria-haspopup="dialog"
            className={cn("max-[359px]:w-full", locked && "cursor-not-allowed opacity-45")}
            onClick={() => { if (!locked) onOpen?.(member); }}
            ref={(element) => registerTrigger?.(member.id, element)}
            size="sm"
            variant="outline"
          >
            更改角色<span className="sr-only">：{name}</span>
          </Button>
        ) : null}
        {showRestriction ? (
          <p className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" data-restriction={restriction}>
            <Lock aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{RESTRICTION_COPY[restriction].short}</span>
            <span className="sr-only">：{RESTRICTION_COPY[restriction].detail}</span>
          </p>
        ) : null}
      </div> : null}

      {/* Kept in the accessibility tree while empty so the live region announces the first result. */}
      <div className={content ? "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 md:col-span-2" : "sr-only"}>
        <p
          aria-live="polite"
          className={cn(
            "min-w-0 overflow-wrap-anywhere text-xs leading-5",
            content?.tone === "success" && "text-success-foreground",
            content?.tone === "error" && "text-destructive-foreground",
            content?.tone === "muted" && "text-muted-foreground",
          )}
          id={noticeId}
          role="status"
        >
          {content?.text}
        </p>
        {recovery === "login"
          ? <Button asChild size="sm" variant="ghost"><Link href={loginHref}>重新登录</Link></Button>
          : recovery === "refresh" && onRefresh
            ? <Button onClick={onRefresh} size="sm" variant="ghost"><RefreshCw aria-hidden="true" className="size-3.5" />刷新最新状态</Button>
            : null}
      </div>
    </li>
  );
}
