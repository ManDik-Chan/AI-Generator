import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";

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
    <header className="sticky top-0 z-40 flex min-h-[4.25rem] items-center justify-between gap-3 border-b border-border/10 bg-surface-raised/86 px-4 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] backdrop-blur-xl min-[821px]:hidden">
      <div className="flex min-w-0 items-center gap-2">
        {title ? (
          <>
            {back ?? <Brand compact />}
            <span className="truncate text-sm font-bold">{title}</span>
          </>
        ) : (
          <Brand className="min-w-0" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
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
