import { RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBanner } from "@/components/ui/status-banner";
import { PlatformRoleBadge } from "@/features/admin/components/platform-role-badge";
import type { PlatformMember, PlatformRole } from "@/features/admin/rbac/contract";
import { describeRoleChange, memberName, PLATFORM_ROLE_LABEL, RESTRICTION_COPY, roleChangeFailureCopy } from "@/features/admin/rbac/copy";
import { canSubmit, type RoleChangeSession } from "@/features/admin/rbac/role-change-state";

export interface RoleChangeDialogViewProps {
  member: PlatformMember | null;
  session: RoleChangeSession | null;
  loginHref: string;
  onSelect?(role: PlatformRole): void;
  onClose?(): void;
  onSubmit?(): void;
  onRefresh?(): void;
  bodyRef?: Ref<HTMLDivElement>;
  recoveryRef?: Ref<HTMLButtonElement | HTMLAnchorElement>;
  confirmRef?: Ref<HTMLButtonElement>;
}

const FORM_ID = "platform-role-change-form";

export function RoleChangeDialogView({ member, session, loginHref, onSelect, onClose, onSubmit, onRefresh, bodyRef, recoveryRef, confirmRef }: RoleChangeDialogViewProps) {
  const open = Boolean(member && session && member.id === session.memberId);
  const saving = session?.status === "saving";
  const failure = session?.failure ?? null;
  const blocked = Boolean(failure && !failure.retryable);
  const change = session?.nextRole ? describeRoleChange(session.baseRole, session.nextRole) : null;
  const options = member?.roleChange.assignableRoles ?? [];
  const failureCopy = failure ? roleChangeFailureCopy(failure.code, failure) : null;

  return (
    <Dialog
      footer={open ? (
        <>
          <Button disabled={saving} onClick={() => onClose?.()} type="button" variant="ghost">{blocked || !options.length ? "关闭" : "取消"}</Button>
          {options.length ? (
            <Button disabled={!canSubmit(session)} form={FORM_ID} loading={saving} ref={confirmRef} type="submit">
              {saving ? "正在保存…" : change?.confirmLabel ?? "选择新角色"}
            </Button>
          ) : null}
        </>
      ) : undefined}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      open={open}
      title="调整平台角色"
    >
      {open && member && session ? (
        <form
          aria-busy={saving || undefined}
          className="grid gap-4"
          id={FORM_ID}
          onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}
        >
          <div className="grid gap-4" ref={bodyRef}>
            <div className="premium-subpanel grid gap-1 p-3">
              <p className="overflow-wrap-anywhere text-sm font-semibold">{memberName(member)}</p>
              {member.displayName?.trim() ? <p className="overflow-wrap-anywhere text-xs text-muted-foreground">{member.email}</p> : null}
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">当前角色 <PlatformRoleBadge role={session.baseRole} /></p>
            </div>

            {session.supersededFrom ? (
              <StatusBanner title="这位用户刚刚被更新" variant="warning">
                {session.supersededFrom === session.baseRole
                  ? "服务端数据已经变化，之前的选择已清除。请按最新状态重新确认。"
                  : `角色已从${PLATFORM_ROLE_LABEL[session.supersededFrom]}变为${PLATFORM_ROLE_LABEL[session.baseRole]}，之前的选择已清除。请按最新状态重新确认。`}
              </StatusBanner>
            ) : null}

            {options.length ? (
              <fieldset className="grid gap-2" disabled={saving || blocked}>
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">调整为</legend>
                {options.map((role) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-control border border-border/14 p-3 transition-colors has-[:checked]:border-foreground has-[:checked]:bg-surface-raised has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring"
                    key={role}
                  >
                    <input
                      checked={session.nextRole === role}
                      className="mt-1 size-4 shrink-0 accent-[hsl(var(--foreground))]"
                      name={`platform-role-next-${member.id}`}
                      onChange={() => onSelect?.(role)}
                      type="radio"
                      value={role}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{PLATFORM_ROLE_LABEL[role]}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{describeRoleChange(session.baseRole, role).consequence}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <StatusBanner title="当前不能调整" variant="info">
                {member.roleChange.restriction ? RESTRICTION_COPY[member.roleChange.restriction].detail : "服务端没有为这位用户提供可执行的角色调整。"}
              </StatusBanner>
            )}

            {change && !failure && !saving ? (
              <StatusBanner title={change.tone === "elevate" ? "确认前请注意：权限将扩大" : "确认前请注意：权限将收回"} variant={change.tone === "elevate" ? "warning" : "info"}>
                {change.consequence} 提交后服务端会再次核对你的权限和对方的当前角色，任一不符都不会生效。
              </StatusBanner>
            ) : null}

            {failureCopy ? (
              <StatusBanner title={failureCopy.title} variant="error">
                <p>{failureCopy.body}</p>
                {failureCopy.recovery === "login" ? (
                  <Button asChild className="mt-2" size="sm" variant="outline"><Link href={loginHref} ref={recoveryRef as Ref<HTMLAnchorElement>}>重新登录</Link></Button>
                ) : failureCopy.recovery === "refresh" && onRefresh ? (
                  <Button className="mt-2" onClick={onRefresh} ref={recoveryRef as Ref<HTMLButtonElement>} size="sm" type="button" variant="outline"><RefreshCw aria-hidden="true" className="size-3.5" />刷新最新状态</Button>
                ) : null}
              </StatusBanner>
            ) : null}

            <p aria-live="polite" className="sr-only" role="status">{saving ? "正在保存角色调整" : ""}</p>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
