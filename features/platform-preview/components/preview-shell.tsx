import type { ReactNode } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";

import { PreviewMobileHeader, PreviewMobileNavigation, PreviewTopbar } from "@/features/platform-preview/components/preview-chrome";
import { PreviewSidebar } from "@/features/platform-preview/components/preview-sidebar";

/**
 * Public, read-only shell for /platform. It mirrors the workspace AppShell layout
 * but never reads the session, Supabase or any user data.
 */
export function PreviewShell({ children }: { children: ReactNode }) {
  return (
    <div className="premium-shell app-shell-root relative z-[1]" data-platform-preview="" data-scroll-mode="document">
      <PreviewSidebar />
      <div className="app-shell-content flex min-w-0 flex-col min-[821px]:ml-[15.75rem]">
        <PreviewMobileHeader />
        <PreviewTopbar />
        <main className="app-shell-main relative z-[1] mx-auto min-h-0 w-full max-w-[100rem] flex-1 px-3.5 pb-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+1.5rem)] pt-4 min-[521px]:px-6 min-[821px]:px-[clamp(1.5rem,3vw,3rem)] min-[821px]:pb-16 min-[821px]:pt-8">
          <div className="mb-8 flex flex-col gap-2 rounded-card border border-dashed border-foreground/18 px-4 py-3 text-xs text-muted-foreground min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between" role="note">
            <p className="flex items-start gap-2"><Eye aria-hidden="true" className="mt-px size-3.5 shrink-0 text-foreground" /><span><b className="font-medium text-foreground">演示预览</b> · 公开只读，不连接私有数据库，不执行真实运行；页面中的项目、运行与记录均为示例数据。</span></p>
            <Link className="link-grow w-fit shrink-0 text-foreground" href="/login" prefetch={false}>登录后使用已上线功能</Link>
          </div>
          {children}
        </main>
      </div>
      <PreviewMobileNavigation />
    </div>
  );
}
