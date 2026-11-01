import type { ReactNode } from "react";

import { ConsoleHeader } from "@/features/developer-console/components/console-header";
import { ConsoleProvider } from "@/features/developer-console/components/console-provider";

// Mock mode of the signed-in console: the in-browser mock adapter, labelled on every screen.
export default function DeveloperMockConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProvider>
      <ConsoleHeader base="/developer" registryHref="/developer/registry" />
      {children}
    </ConsoleProvider>
  );
}
