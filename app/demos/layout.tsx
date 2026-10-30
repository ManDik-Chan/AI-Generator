import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: { default: "可运行的 Demo", template: "%s · Demo · AI-Generator" },
  description: "两个可以直接运行的 AI-Generator Demo：服务端执行的路线优化求解器，与在浏览器中训练的神经网络。",
};

// Public: demo pages never read a session or user data.
export default function DemosLayout({ children }: { children: ReactNode }) {
  return (
    <div className="premium-shell relative z-[1] min-h-[var(--app-height)]">
      <SiteHeader />
      <main className="relative z-[1]">{children}</main>
      <SiteFooter />
    </div>
  );
}
