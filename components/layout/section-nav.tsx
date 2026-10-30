"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { hubNavigation, isHubPath, isItemActive, resolveHref, type ShellMode } from "@/components/layout/navigation";
import { statusMeta } from "@/features/platform/status";
import { cn } from "@/lib/utils";

/** Second row of navigation, shown on every AI Hub page (chat has its own immersive layout). */
export function SectionNav({ mode = "live" }: { mode?: ShellMode }) {
  const pathname = usePathname();
  if (!isHubPath(pathname, mode)) return null;
  const items = hubNavigation.filter((item) => resolveHref(item, mode));

  return (
    <nav aria-label="AI Hub" className="safe-inline relative z-30 border-b border-border/10 bg-background/86 backdrop-blur-xl min-[1024px]:sticky min-[1024px]:top-[var(--shell-header-height)] min-[1024px]:px-0" data-section-nav="">
      <div className="scroll-x mx-auto flex max-w-[100rem] items-center gap-1 px-1 min-[521px]:px-3 min-[1024px]:gap-2 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)]">
        <span className="mr-2 hidden shrink-0 text-xs text-muted-foreground min-[1024px]:inline">AI Hub</span>
        {items.map((item) => {
          const active = isItemActive(pathname, item, mode);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 shrink-0 items-center gap-1.5 px-2.5 text-[.8125rem] font-medium transition-colors duration-300",
                "after:absolute after:inset-x-2.5 after:-bottom-px after:h-[2px] after:origin-left after:bg-foreground after:transition-transform after:duration-500 after:ease-out-expo",
                active ? "text-foreground after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-foreground",
              )}
              href={resolveHref(item, mode) as string}
              key={item.key}
              prefetch={false}
            >
              <item.icon aria-hidden="true" className="size-3.5" />
              {item.label}
              {item.status ? <span className="rounded-full border border-border/16 px-1.5 text-[.5625rem] leading-4 text-muted-foreground">{statusMeta[item.status].label}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
