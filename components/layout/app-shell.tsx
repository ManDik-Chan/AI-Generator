import type { ReactNode } from "react";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import {
  appShellWidthClasses,
  type AppShellVariant,
} from "@/components/layout/layout-variants";
import { cn } from "@/lib/utils";

export type { AppShellVariant } from "@/components/layout/layout-variants";

export function AppShell({ children, variant = "standard", mobileTitle, mobileAction, className }: { children: ReactNode; variant?: AppShellVariant; mobileTitle?: string; mobileAction?: ReactNode; className?: string }) {
  return <div className="min-h-screen md:grid md:grid-cols-[17rem_minmax(0,1fr)]"><DesktopSidebar /><div className="min-w-0"><MobileHeader action={mobileAction} title={mobileTitle} /><main className={cn("mx-auto w-full px-4 pb-28 pt-6 sm:px-6 md:px-8 md:pb-12 md:pt-9 xl:px-10", appShellWidthClasses[variant], variant === "full" && "p-0 md:p-0", className)}>{children}</main></div><MobileNavigation /></div>;
}
