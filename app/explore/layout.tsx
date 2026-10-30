import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: { default: "探索项目", template: "%s · 探索 · AI-Generator" },
  description: "AI-Generator 公开项目目录：每个项目一页完整的成果、如实的证据等级、可交互的实验室与不可变版本。",
};

// Public and static: Explore never reads a session or user data.
export default function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="premium-shell relative z-[1] min-h-[var(--app-height)]">
      <SiteHeader />
      <main className="relative z-[1]">{children}</main>
      <SiteFooter />
    </div>
  );
}
