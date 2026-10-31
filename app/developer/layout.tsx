import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { ConsoleHeader } from "@/features/developer-console/components/console-header";
import { ConsoleProvider } from "@/features/developer-console/components/console-provider";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Signed-in console. Each page also calls requireUser(): layouts are not re-rendered on
// client navigation between console pages. Data is still the mock adapter (labelled).
export default async function DeveloperConsoleLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <AppShell mobileTitle="开发者" variant="wide">
      <ConsoleProvider>
        <ConsoleHeader base="/developer" />
        {children}
      </ConsoleProvider>
    </AppShell>
  );
}
