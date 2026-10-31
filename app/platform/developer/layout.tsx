import type { ReactNode } from "react";

import { ConsoleHeader } from "@/features/developer-console/components/console-header";
import { ConsoleProvider } from "@/features/developer-console/components/console-provider";

// Public and static like the rest of /platform: the console runs on its in-browser mock adapter.
export default function DemoDeveloperConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProvider>
      <ConsoleHeader base="/platform/developer" />
      {children}
    </ConsoleProvider>
  );
}
