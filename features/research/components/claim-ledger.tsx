"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { claimMeta } from "@/features/platform/labels";
import type { ClaimStatus } from "@/features/platform/types";
import { cn } from "@/lib/utils";

const order: ClaimStatus[] = ["EXPERIMENT_VERIFIED", "SOURCE_IMPLEMENTED", "DOCUMENTED", "PLANNED"];

/**
 * Claim → evidence → experiment ledger. Every row is rendered on the server (so all evidence
 * is in the HTML without JavaScript); this component only filters rows by evidence level.
 * A link to #claim-<id> clears the filter so the target row is always visible.
 */
export function ClaimLedger({ items }: { items: { id: string; status: ClaimStatus; content: ReactNode }[] }) {
  const [filter, setFilter] = useState<ClaimStatus | "all">("all");
  const present = useMemo(() => order.filter((status) => items.some((item) => item.status === status)), [items]);

  useEffect(() => {
    const reveal = () => {
      if (window.location.hash.startsWith("#claim-")) setFilter("all");
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  const chip = (active: boolean) => cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[.8125rem] font-medium transition-colors duration-300",
    active ? "bg-foreground text-background" : "border border-border/14 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
  );

  return (
    <div>
      {present.length > 1 ? (
        <div aria-label="按证据等级筛选声明" className="scroll-x -mx-1 mb-2 flex gap-1.5 px-1" role="group">
          <button aria-pressed={filter === "all"} className={chip(filter === "all")} onClick={() => setFilter("all")} type="button">全部<span className="tabular-nums opacity-70">{items.length}</span></button>
          {present.map((status) => (
            <button aria-pressed={filter === status} className={chip(filter === status)} key={status} onClick={() => setFilter(status)} type="button">
              {claimMeta[status].label}<span className="tabular-nums opacity-70">{items.filter((item) => item.status === status).length}</span>
            </button>
          ))}
        </div>
      ) : null}
      <ol className="border-t border-border/12">
        {items.map((item) => (
          <li
            className="scroll-mt-28 border-b border-border/12 transition-colors duration-700 target:bg-surface/70"
            hidden={filter !== "all" && item.status !== filter}
            id={`claim-${item.id}`}
            key={item.id}
          >
            {item.content}
          </li>
        ))}
      </ol>
    </div>
  );
}
