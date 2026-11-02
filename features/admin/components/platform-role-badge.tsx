import { Crown, ShieldCheck, UserRound } from "lucide-react";

import type { PlatformRole } from "@/features/admin/rbac/contract";
import { PLATFORM_ROLE_LABEL } from "@/features/admin/rbac/copy";
import { cn } from "@/lib/utils";

// Owner is the one solid pill on the page, so it reads as distinct at a glance in both themes.
const tone: Record<PlatformRole, string> = {
  OWNER: "border-transparent bg-foreground text-background",
  ADMIN: "border-transparent bg-info-subtle text-info-foreground",
  USER: "border-border/14 text-muted-foreground",
};
const icon = { OWNER: Crown, ADMIN: ShieldCheck, USER: UserRound } satisfies Record<PlatformRole, unknown>;

export function PlatformRoleBadge({ role, className }: { role: PlatformRole; className?: string }) {
  const Icon = icon[role];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[.6875rem] font-medium leading-5", tone[role], className)} data-platform-role={role}>
      <Icon aria-hidden="true" className="size-3" />
      {PLATFORM_ROLE_LABEL[role]}
    </span>
  );
}
