import { Suspense, type ReactNode } from "react";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import {
  appShellWidthClasses,
  type AppShellVariant,
} from "@/components/layout/layout-variants";
import { getShellViewer } from "@/components/layout/shell-viewer-data";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { WorkspaceTopbar } from "@/components/layout/workspace-topbar";
import { cn } from "@/lib/utils";

export type { AppShellVariant } from "@/components/layout/layout-variants";

export type AppShellScrollMode = "document" | "viewport";

async function ResolvedDesktopSidebar() {
  return <DesktopSidebar viewer={await getShellViewer()} />;
}

async function ResolvedMobileHeader({ action, title }: { action?: ReactNode; title?: string }) {
  return <MobileHeader action={action} title={title} viewer={await getShellViewer()} />;
}

async function ResolvedWorkspaceTopbar() {
  return <WorkspaceTopbar viewer={await getShellViewer()} />;
}

export function AppShell({
  children,
  variant = "standard",
  scrollMode = "document",
  mobileTitle,
  mobileAction,
  className,
  viewer,
}: {
  children: ReactNode;
  variant?: AppShellVariant;
  scrollMode?: AppShellScrollMode;
  mobileTitle?: string;
  mobileAction?: ReactNode;
  className?: string;
  viewer?: ShellViewer;
}) {
  return (
    <div className="premium-shell app-shell-root relative z-[1]" data-scroll-mode={scrollMode}>
      {viewer ? <DesktopSidebar viewer={viewer} /> : <Suspense fallback={<DesktopSidebar />}><ResolvedDesktopSidebar /></Suspense>}
      <div className="app-shell-content flex min-w-0 flex-col min-[821px]:ml-[15.75rem]">
        {viewer ? <MobileHeader action={mobileAction} title={mobileTitle} viewer={viewer} /> : <Suspense fallback={<MobileHeader action={mobileAction} title={mobileTitle} />}><ResolvedMobileHeader action={mobileAction} title={mobileTitle} /></Suspense>}
        {viewer ? <WorkspaceTopbar viewer={viewer} /> : <Suspense fallback={null}><ResolvedWorkspaceTopbar /></Suspense>}
        <main
          data-app-scroll-region
          className={cn(
            "app-shell-main mobile-scroll-region relative z-[1] mx-auto min-h-0 w-full flex-1 px-3.5 pb-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+1.5rem)] pt-4 min-[521px]:px-6 min-[821px]:px-[clamp(1.5rem,3vw,3rem)] min-[821px]:pb-16 min-[821px]:pt-8",
            appShellWidthClasses[variant],
            variant === "full" && "p-0 min-[821px]:p-0",
            className,
          )}
        >
          {children}
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}
