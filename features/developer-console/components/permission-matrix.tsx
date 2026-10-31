"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";

import { ToneBadge } from "@/components/platform/primitives";
import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import type { ConsoleAction, ConsoleRole } from "@/features/developer-console/model";
import { ACTION_ROLES, actionMeta, contractMeta, roleLabels, type ContractStatus } from "@/features/developer-console/permissions";
import { cn } from "@/lib/utils";

const roles: ConsoleRole[] = ["OWNER", "EDITOR", "REVIEWER", "PUBLISHER", "VIEWER"];
const contractTone: Record<ContractStatus, "success" | "warning" | "neutral"> = { merged: "success", provisional: "warning", gap: "neutral" };
const order = Object.keys(actionMeta) as ConsoleAction[];

/** Action × role matrix. Pick a role to see exactly what it may do, and under which extra rule. */
export function PermissionMatrix() {
  const [focus, setFocus] = useState<ConsoleRole | null>(null);
  const allowed = focus ? order.filter((action) => ACTION_ROLES[action].includes(focus)) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Labels never wrap; on narrow screens the pill row scrolls instead. */}
        <div className="scroll-x -mx-1 max-w-[calc(100%+.5rem)] px-1 py-0.5">
          <SegmentedControl className="whitespace-nowrap" label="按角色查看">
            <Segment active={focus === null} className="max-[520px]:px-3" onClick={() => setFocus(null)}>全部</Segment>
            {roles.map((role) => <Segment active={focus === role} className="max-[520px]:px-3" key={role} onClick={() => setFocus(role)}>{roleLabels[role]}</Segment>)}
          </SegmentedControl>
        </div>
        <p aria-live="polite" className="text-[.75rem] text-muted-foreground">
          {focus ? `「${roleLabels[focus]}」可以执行 ${allowed.length} / ${order.length} 项操作，前提是会话与平台操作资格同时有效。` : "勾号表示该项目角色满足此操作；平台操作资格需要另外单独授予。"}
        </p>
      </div>
      <div className="scroll-x">
        <table className="w-full min-w-[52rem] border-collapse text-left text-[.8125rem]">
          <caption className="sr-only">Registry 操作与项目角色对照</caption>
          <thead>
            <tr className="border-b border-border/12 text-[.75rem] text-muted-foreground">
              <th className="py-2.5 pr-4 font-medium" scope="col">操作</th>
              {roles.map((role) => (
                <th className={cn("w-[4.5rem] px-1 py-2.5 text-center font-medium transition-colors duration-300", focus === role && "text-foreground")} key={role} scope="col">{roleLabels[role]}</th>
              ))}
              <th className="py-2.5 pl-3 font-medium" scope="col">额外规则 · 契约</th>
            </tr>
          </thead>
          <tbody>
            {order.map((action) => {
              const meta = actionMeta[action];
              const dim = focus !== null && !ACTION_ROLES[action].includes(focus);
              return (
                <tr className={cn("border-b border-border/10 align-top transition-opacity duration-300", dim && "opacity-35")} key={action}>
                  <th className="py-3 pr-4 font-normal" scope="row">
                    <span className="text-[.8125rem] font-medium">{meta.label}</span>
                    <span className="mt-0.5 block font-code text-[.6875rem] text-muted-foreground">{action}</span>
                  </th>
                  {roles.map((role) => {
                    const yes = ACTION_ROLES[action].includes(role);
                    return (
                      <td className={cn("px-1 py-3 text-center", focus === role && "bg-surface")} key={role}>
                        {yes ? <Check aria-label="允许" className="mx-auto size-4" /> : <Minus aria-label="不允许" className="mx-auto size-4 text-muted-foreground/50" />}
                      </td>
                    );
                  })}
                  <td className="py-3 pl-3 text-[.75rem] text-muted-foreground">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ToneBadge tone={contractTone[meta.contract]}>{contractMeta[meta.contract].label}</ToneBadge>
                      {meta.independence ? <span className="text-foreground">{meta.independence}</span> : null}
                    </span>
                    <span className="mt-1 block">{meta.detail}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
