import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      aria-label="AI-Generator 首页"
      className={cn(
        "group flex min-w-0 items-center gap-2.5 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        className,
      )}
      href="/"
    >
      <span className="grid size-[2.375rem] shrink-0 place-items-center rounded-[.8125rem] bg-gradient-to-br from-primary via-primary to-[#4f7dff] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/.2),0_10px_26px_hsl(var(--primary)/.24)] transition-transform duration-panel group-hover:-rotate-2 group-hover:scale-[1.03]">
        <svg
          aria-hidden="true"
          className="size-[1.35rem] fill-current"
          viewBox="0 0 32 32"
        >
          <path d="M16 3.5 19.1 11l7.4 3.2-7.4 3.2L16 25l-3.1-7.6-7.4-3.2 7.4-3.2L16 3.5Z" />
          <path d="m24.5 21 1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2 1.2-2.8Z" />
        </svg>
      </span>
      {!compact ? (
        <span className="min-w-0 leading-none">
          <span className="block truncate text-sm font-bold tracking-[-.025em]">
            AI-Generator
          </span>
          <span className="mt-1 block truncate text-[.625rem] tracking-[.04em] text-muted-foreground">
            Lumen Interface
          </span>
        </span>
      ) : null}
    </Link>
  );
}
