import type { ReactNode } from "react";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import {
  appShellWidthClasses,
  type AppShellVariant,
} from "@/components/layout/layout-variants";
import { getShellViewer } from "@/components/layout/shell-viewer-data";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { cn } from "@/lib/utils";

export type { AppShellVariant } from "@/components/layout/layout-variants";

export async function AppShell({
  children,
  variant = "standard",
  mobileTitle,
  mobileAction,
  className,
  viewer,
}: {
  children: ReactNode;
  variant?: AppShellVariant;
  mobileTitle?: string;
  mobileAction?: ReactNode;
  className?: string;
  viewer?: ShellViewer;
}) {
  const resolvedViewer = viewer ?? (await getShellViewer());

  return (
    <div className="premium-shell relative z-[1] min-h-screen">
      <DesktopSidebar viewer={resolvedViewer} />
      <div className="min-w-0 min-[821px]:ml-[14.375rem] min-[1181px]:ml-[17rem]">
        <MobileHeader
          action={mobileAction}
          title={mobileTitle}
          viewer={resolvedViewer}
        />
        <main
          className={cn(
            "relative z-[1] mx-auto w-full px-3.5 pb-28 pt-4 min-[521px]:px-6 min-[821px]:px-8 min-[821px]:pb-16 min-[821px]:pt-[2.375rem]",
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
