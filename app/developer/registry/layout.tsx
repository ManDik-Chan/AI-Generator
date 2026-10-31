import type { ReactNode } from "react";

import { RegistryConsoleHeader } from "@/features/developer-console/components/registry-header";
import { RegistryConsoleProvider } from "@/features/developer-console/components/registry-provider";

// Read-only Registry mode: the signed-in user's own Bearer reads. No mock provider exists here.
export default function DeveloperRegistryConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <RegistryConsoleProvider>
      <RegistryConsoleHeader base="/developer/registry" mockHref="/developer" />
      {children}
    </RegistryConsoleProvider>
  );
}
