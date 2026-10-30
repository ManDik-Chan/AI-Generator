"use client";

import { useState } from "react";
import Link from "next/link";

import { ToneBadge } from "@/components/platform/primitives";
import { dataFlowMeta } from "@/features/platform/labels";
import type { ProjectGrant } from "@/features/platform/types";
import { cn } from "@/lib/utils";

const statusMeta = {
  ACTIVE: { label: "生效中", tone: "success" as const },
  EXPIRED: { label: "已过期", tone: "neutral" as const },
  REVOKED: { label: "已撤销", tone: "danger" as const },
};

/** Grants with a working "revoke" button. Demo state: the change lives only on this page. */
export function GrantsTable({ grants, projectBase }: { grants: ProjectGrant[]; projectBase: string }) {
  const [items, setItems] = useState(grants);
  const revoke = (id: string) => setItems((current) => current.map((grant) => grant.id === id ? { ...grant, status: "REVOKED" } : grant));
  return (
    <ul className="border-t border-border/12">
      {items.map((grant) => (
        <li className={cn("grid gap-x-6 gap-y-3 border-b border-border/12 py-4 transition-opacity duration-500 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] min-[1024px]:items-center", grant.status !== "ACTIVE" && "opacity-60")} key={grant.id}>
          <div className="min-w-0">
            <Link className="link-grow text-sm font-medium" href={`/explore/${grant.projectSlug}`} prefetch={false}>{grant.project}</Link>
            <p className="mt-1 truncate font-code text-[.6875rem] text-muted-foreground">{grant.capability}</p>
          </div>
          <div className="min-w-0 text-[.8125rem] text-muted-foreground">
            {grant.scope}
            <span className="mt-1 flex items-center gap-1.5 text-[.75rem] text-foreground">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", grant.dataFlow === "developer" ? "bg-warning" : grant.dataFlow === "platform" ? "bg-primary" : "bg-muted-foreground/50")} />
              {dataFlowMeta[grant.dataFlow].label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[.75rem] text-muted-foreground">
            <ToneBadge dot tone={statusMeta[grant.status].tone}>{statusMeta[grant.status].label}</ToneBadge>
            <span>到期 {grant.expires}</span>
          </div>
          <div className="min-[1024px]:text-right">
            {grant.status === "ACTIVE"
              ? <button className="rounded-full border border-border/20 px-3.5 py-1.5 text-[.75rem] font-medium transition-colors duration-300 hover:border-destructive hover:bg-destructive-subtle hover:text-destructive-foreground" onClick={() => revoke(grant.id)} type="button">撤销</button>
              : <span className="text-[.75rem] text-muted-foreground">新的运行将被拒绝</span>}
          </div>
        </li>
      ))}
      <li className="pt-3 text-[.6875rem] text-muted-foreground">演示状态：撤销只在本页生效。<Link className="link-grow ml-1" href={projectBase} prefetch={false}>查看我的项目</Link></li>
    </ul>
  );
}
