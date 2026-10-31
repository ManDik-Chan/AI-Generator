import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Signed-in console. Each page also calls requireUser(): layouts are not re-rendered on
// client navigation between console pages. The two data sources have separate layouts:
// (mock)/layout.tsx for the labelled in-browser mock, registry/layout.tsx for read-only
// Registry data. Neither provider is nested in the other.
export default async function DeveloperConsoleLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <AppShell mobileTitle="开发者" variant="wide">
      {children}
    </AppShell>
  );
}
