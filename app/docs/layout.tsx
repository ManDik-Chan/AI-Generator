import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: { default: "开发者文档", template: "%s · 开发者文档 · AI-Generator" },
  description: "AI-Generator 开发者文档：开发者手册、API Reference、Manifest 与能力描述符、接口清单。",
};

// Public and static: the docs are Markdown from docs/developer rendered at build time.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="premium-shell relative z-[1] min-h-[var(--app-height)]">
      <SiteHeader />
      <main className="relative z-[1]">{children}</main>
      <SiteFooter />
    </div>
  );
}
