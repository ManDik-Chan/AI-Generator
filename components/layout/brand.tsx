import Link from "next/link";
import { cn } from "@/lib/utils";

// Same wordmark as the public landing page: the curved spark plus "AI-Generator®".
const SPARK = "M32 13c1.8 10.5 7.5 16.2 18 18-10.5 1.8-16.2 7.5-18 18-1.8-10.5-7.5-16.2-18-18 10.5-1.8 16.2-7.5 18-18Z";

export function Brand({
  compact = false,
  className,
  href = "/workspace",
}: {
  compact?: boolean;
  className?: string;
  href?: string;
}) {
  return (
    <Link
      aria-label={href === "/" ? "AI-Generator 官网首页" : "AI-Generator 工作台"}
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        className,
      )}
      href={href}
      prefetch={false}
    >
      <svg
        aria-hidden="true"
        className="size-[1.375rem] shrink-0 fill-current transition-transform duration-700 ease-out-expo group-hover:rotate-90 group-hover:scale-110"
        viewBox="13 12 38 38"
      >
        <path d={SPARK} />
      </svg>
      {!compact ? (
        <span className="flex min-w-0 items-start truncate text-[1.25rem] font-semibold leading-none tracking-[-.04em]">
          AI-Generator
          <sup className="ml-px mt-0.5 text-[.5rem] font-medium leading-none">®</sup>
        </span>
      ) : null}
    </Link>
  );
}
