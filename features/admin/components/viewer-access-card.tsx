import { Check, Minus } from "lucide-react";

import { PlatformRoleBadge } from "@/features/admin/components/platform-role-badge";
import type { PlatformViewer } from "@/features/admin/rbac/contract";
import { PLATFORM_ROLE_SUMMARY, PLATFORM_VS_PROJECT_NOTE, viewerCapabilityLines, type ViewerConnections } from "@/features/admin/rbac/copy";

/** Who is signed in, what that platform role means, and what the server lets them do right now. */
export function ViewerAccessCard({ viewer, connected }: { viewer: PlatformViewer; connected?: ViewerConnections }) {
  return (
    <section aria-labelledby="viewer-access-title" className="premium-panel-strong grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold" id="viewer-access-title">你的平台身份</h3>
          <PlatformRoleBadge role={viewer.platformRole} />
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{PLATFORM_ROLE_SUMMARY[viewer.platformRole]}</p>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{PLATFORM_VS_PROJECT_NOTE}</p>
      </div>
      <div className="min-w-0">
        <h4 className="text-xs font-semibold text-muted-foreground">本次登录可执行</h4>
        <ul className="mt-2 grid gap-1.5">
          {viewerCapabilityLines(viewer, connected).map((line) => (
            <li className="flex items-start gap-2 text-sm leading-6" data-allowed={line.allowed} key={line.key}>
              {line.allowed
                ? <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />
                : <Minus aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />}
              <span className={line.allowed ? undefined : "text-muted-foreground"}>{line.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
