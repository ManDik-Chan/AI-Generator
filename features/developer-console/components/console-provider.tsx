"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import type { ConsoleAdapter } from "@/features/developer-console/adapter";
import { formatRemaining } from "@/features/developer-console/labels";
import { createMockConsoleAdapter } from "@/features/developer-console/mock/adapter";

const AdapterContext = createContext<ConsoleAdapter | null>(null);

/**
 * One adapter per console visit. It lives in the console layout, so moving between the
 * workbench, a release desk and the other console pages keeps the mock state; a full
 * reload starts again from the seed.
 */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [adapter] = useState(() => createMockConsoleAdapter());
  useEffect(() => {
    adapter.tools?.start();
    return () => adapter.tools?.stop();
  }, [adapter]);
  return <AdapterContext.Provider value={adapter}>{children}</AdapterContext.Provider>;
}

export function useConsoleAdapter() {
  const adapter = useContext(AdapterContext);
  if (!adapter) throw new Error("useConsoleAdapter must be used inside <ConsoleProvider>");
  return adapter;
}

export function useConsole() {
  const adapter = useConsoleAdapter();
  return useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getServerSnapshot);
}

/** "剩 mm:ss" until a deadline on the adapter's clock; ticks on its own. */
export function Countdown({ deadline, className }: { deadline: string; className?: string }) {
  const adapter = useConsoleAdapter();
  const initial = useConsole().now;
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const read = () => setNow(adapter.tools?.now() ?? Date.now());
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [adapter]);
  const left = Date.parse(deadline) - now;
  return <span className={className} suppressHydrationWarning>{formatRemaining(left)}</span>;
}
