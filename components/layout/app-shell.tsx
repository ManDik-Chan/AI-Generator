import type { ReactNode } from "react";

import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <DesktopSidebar />
      <div className="min-w-0">
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-12 md:pt-8">
          {children}
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}
