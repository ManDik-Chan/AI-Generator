import type { ReactNode } from "react";
import { SessionSync } from "@/features/auth/components/session-sync";

export default function ChatSessionLayout({ children }: { children: ReactNode }) {
  return <><SessionSync />{children}</>;
}
