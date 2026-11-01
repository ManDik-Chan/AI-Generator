import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: { default: "Research Lab", template: "%s · Research Lab · AI-Generator" },
  description: "AI-Generator 研究实验室：研究项目的声明、证据与实验记录；确定性的实验可以在浏览器中复现。",
};

// Public and static: the Research Lab never reads a session or user data, and starts no server run.
export default function ResearchLayout({ children }: { children: ReactNode }) {
  return (
    <div className="premium-shell relative z-[1] min-h-[var(--app-height)]">
      <SiteHeader />
      <main className="relative z-[1]">{children}</main>
      <SiteFooter />
    </div>
  );
}
