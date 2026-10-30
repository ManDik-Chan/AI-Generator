import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PreviewShell } from "@/features/platform-preview/components/preview-shell";

export const metadata: Metadata = {
  title: { default: "平台预览", template: "%s · 平台预览 · AI-Generator" },
  description: "AI-Generator 统一 AI 工作平台的公开只读预览：Workspace、Projects、Agent、Skills 与 AI Hub。所有数据均为示例。",
};

// Public, read-only and static: no session, Supabase or user data is read under /platform.
export default function PlatformPreviewLayout({ children }: { children: ReactNode }) {
  return <PreviewShell>{children}</PreviewShell>;
}
