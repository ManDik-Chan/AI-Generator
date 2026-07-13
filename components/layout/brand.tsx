import { Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link className={cn("group flex items-center gap-3 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring", className)} href="/" aria-label="AI-Generator 首页">
      <span className="grid size-10 shrink-0 place-items-center rounded-[.9rem] bg-primary text-primary-foreground shadow-soft transition-transform duration-fast group-hover:scale-[1.03]">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[.9375rem] font-semibold tracking-[-.02em]">AI-Generator</span>
          <span className="block truncate text-caption">私人 AI 工作空间</span>
        </span>
      )}
    </Link>
  );
}
