"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { type AdminRoleActionState, updateAdminRoleAction } from "@/features/admin/actions";

const initialState: AdminRoleActionState = { status: "idle", message: "" };

function SubmitRoleButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <Button disabled={disabled || pending} size="sm" type="submit" variant="outline">{pending ? "保存中" : "保存角色"}</Button>;
}

export function RoleControl({ profileId, role, disabled }: { profileId: string; role: "ADMIN" | "USER"; disabled: boolean }) {
  const [state, action] = useActionState(updateAdminRoleAction, initialState);
  return <form action={action} className="min-w-0">
    <input name="profileId" type="hidden" value={profileId} />
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select aria-label="用户角色" className="premium-field h-10 w-36 px-3 text-sm" defaultValue={role} disabled={disabled} name="role">
        <option value="USER">普通用户</option>
        <option value="ADMIN">管理员</option>
      </select>
      <SubmitRoleButton disabled={disabled} />
    </div>
    {disabled ? <p className="mt-1.5 text-xs text-muted-foreground">当前登录管理员不可自降权。</p> : null}
    {state.message ? <p aria-live="polite" className={`mt-1.5 text-xs ${state.status === "error" ? "text-destructive-foreground" : "text-success-foreground"}`}>{state.message}</p> : null}
  </form>;
}
