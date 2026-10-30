import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: { default: "演示工作台", template: "%s · 演示工作台 · AI-Generator" },
  description: "AI-Generator 平台的公开演示工作台：项目、开发者控制台、连接与授权，以及 AI Hub。所有数据均为示例，不连接任何账户。",
};

// Public and static: nothing under /platform reads a session, Supabase or user data.
export default function DemoWorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell mode="demo" variant="wide">{children}</AppShell>;
}
