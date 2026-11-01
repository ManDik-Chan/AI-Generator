import { Suspense, type ReactNode } from "react";
import { SessionBoundary } from "@/features/auth/components/session-boundary";

export default function ChatSessionLayout({ children }: { children: ReactNode }) {
  return <><Suspense fallback={null}><SessionBoundary /></Suspense>{children}</>;
}
