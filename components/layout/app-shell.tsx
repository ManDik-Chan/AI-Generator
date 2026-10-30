import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { appShellWidthClasses, type AppShellVariant } from "@/components/layout/layout-variants";
import type { ShellMode } from "@/components/layout/navigation";
import { SectionNav } from "@/components/layout/section-nav";
import { ShellHeader } from "@/components/layout/shell-header";
import { getShellViewer } from "@/components/layout/shell-viewer-data";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { cn } from "@/lib/utils";

export type { AppShellVariant } from "@/components/layout/layout-variants";

export type AppShellScrollMode = "document" | "viewport";

async function ResolvedHeader({ mobileTitle }: { mobileTitle?: string }) {
  return <ShellHeader mobileTitle={mobileTitle} viewer={await getShellViewer()} />;
}

async function ResolvedMobileNavigation() {
  return <MobileNavigation viewer={await getShellViewer()} />;
}

/** Forest ribbon above the demo workspace: everything below is sample data. */
function DemoRibbon() {
  return (
    <div className="safe-inline relative z-50 bg-forest text-[hsl(var(--paper))]" role="note">
      <div className="mx-auto flex min-h-9 max-w-[100rem] items-center justify-between gap-3 py-1.5 text-[.75rem] min-[1024px]:px-[clamp(1.5rem,3vw,3rem)]">
        <p className="min-w-0">
          <span className="mr-2 inline-block size-1.5 rounded-full bg-lime align-middle" />
          <b className="font-medium text-lime">演示工作台</b>
          <span className="opacity-75"> · 公开浏览，所有项目、运行与记录均为示例，不连接任何账户。</span>
        </p>
        <Link className="group inline-flex shrink-0 items-center gap-1 font-medium text-lime" href="/login" prefetch={false}>
          <span className="max-[520px]:hidden">登录真实工作台</span><span className="min-[521px]:hidden">登录</span>
          <ArrowRight aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function ShellFooter({ mode }: { mode: ShellMode }) {
  return (
    <footer className="mx-auto w-full max-w-[100rem] px-4 pb-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+1.25rem)] min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pb-8">
      <div className="flex flex-col gap-2 border-t border-border/10 pt-5 text-[.75rem] text-muted-foreground min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
        <p>AI-Generator · 项目可见性、你的数据与运行授权分别治理{mode === "demo" ? " · 演示工作台" : ""}</p>
        <nav aria-label="页脚" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link className="link-grow hover:text-foreground" href="/" prefetch={false}>官网</Link>
          <Link className="link-grow hover:text-foreground" href="/explore" prefetch={false}>探索项目</Link>
          <a className="link-grow hover:text-foreground" href="https://github.com/ManDik-Chan/AI-Generator" rel="noopener noreferrer" target="_blank">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}

/**
 * Workspace shell: a sticky header with the landing page's pill navigation, an AI Hub
 * sub-navigation, and a floating bottom bar below 1024px. `mode="demo"` renders the same
 * shell for the public demo workspace without reading any session.
 */
export function AppShell({
  children,
  variant = "standard",
  scrollMode = "document",
  mobileTitle,
  className,
  viewer,
  mode = "live",
}: {
  children: ReactNode;
  variant?: AppShellVariant;
  scrollMode?: AppShellScrollMode;
  mobileTitle?: string;
  /** Kept for API compatibility; page actions now live in the page body. */
  mobileAction?: ReactNode;
  className?: string;
  viewer?: ShellViewer;
  mode?: ShellMode;
}) {
  const demo = mode === "demo";
  return (
    <div className="premium-shell app-shell-root relative z-[1] flex flex-col" data-scroll-mode={scrollMode} data-shell-mode={mode}>
      {demo ? <DemoRibbon /> : null}
      {demo || viewer
        ? <ShellHeader mobileTitle={mobileTitle} mode={mode} viewer={viewer} />
        : <Suspense fallback={<ShellHeader mobileTitle={mobileTitle} />}><ResolvedHeader mobileTitle={mobileTitle} /></Suspense>}
      <SectionNav mode={mode} />
      <div className="app-shell-content flex min-w-0 flex-1 flex-col">
        <main
          data-app-scroll-region
          className={cn(
            "app-shell-main mobile-scroll-region relative z-[1] mx-auto min-h-0 w-full flex-1 px-4 pb-10 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pb-16 min-[1024px]:pt-10",
            appShellWidthClasses[variant],
            variant === "full" && "p-0 min-[1024px]:p-0",
            className,
          )}
        >
          {children}
        </main>
        <ShellFooter mode={mode} />
      </div>
      {demo || viewer
        ? <MobileNavigation mode={mode} viewer={viewer} />
        : <Suspense fallback={<MobileNavigation />}><ResolvedMobileNavigation /></Suspense>}
    </div>
  );
}
