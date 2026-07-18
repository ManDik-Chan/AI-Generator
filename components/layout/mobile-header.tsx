import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { MobileWorkspaceMenu } from "@/components/layout/mobile-workspace-menu";

export function MobileHeader({
  title,
  back,
  action,
  viewer,
}: {
  title?: string;
  back?: React.ReactNode;
  action?: React.ReactNode;
  viewer?: ShellViewer;
}) {
  const displayName = viewer?.displayName || viewer?.email || "我的空间";

  return (
    <header className="safe-inline z-40 flex min-h-[var(--mobile-header-height)] shrink-0 items-center justify-between gap-2 border-b border-border/10 bg-surface-raised/86 pb-2 pt-[max(.5rem,var(--safe-area-top))] backdrop-blur-xl min-[821px]:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <MobileWorkspaceMenu viewer={viewer} />
        {title ? (
          <>
            {back}
            <span className="truncate text-sm font-bold">{title}</span>
          </>
        ) : (
          <Brand className="min-w-0" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        <ThemeToggle compact className="border border-border/12 bg-surface/75" />
        <Link
          aria-label="打开账号"
          className="grid size-11 place-items-center rounded-control border border-border/12 bg-surface/75"
          href="/account"
        >
          <Avatar
            className="size-7 rounded-[.55rem] border-0"
            name={displayName}
            src={viewer?.avatarUrl}
          />
        </Link>
      </div>
    </header>
  );
}
