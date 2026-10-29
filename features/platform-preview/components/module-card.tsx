import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { StatusBadge } from "@/features/platform-preview/components/status-badge";
import type { PreviewModule } from "@/features/platform-preview/navigation";

/** Catalogue tile in the same style as the workspace "完整工作空间" grid. */
export function ModuleCard({ module, number }: { module: PreviewModule; number: string }) {
  return (
    <Link className="group relative flex min-h-[14.5rem] flex-col rounded-card bg-surface p-4 transition-colors duration-500 ease-out-expo hover:bg-surface-muted" href={module.href} prefetch={false}>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0"><span className="block text-card-title">{module.name}</span><span className="mt-0.5 block text-caption">{module.label}</span></span>
        <StatusBadge status={module.status} />
      </span>
      <span className="my-5 grid flex-1 place-items-center">
        <span className="premium-icon-tile size-16 rounded-full"><module.icon className="size-6" /></span>
      </span>
      <span className="flex items-end justify-between gap-3">
        <span className="min-w-0"><span className="block text-[.6875rem] tabular-nums text-muted-foreground">{number}</span><span className="mt-1 block text-caption">{module.summary}</span></span>
        <span className="inline-flex shrink-0 translate-y-1 items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[.6875rem] font-medium text-background opacity-0 transition-[opacity,transform] duration-500 ease-out-expo group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">查看<ArrowUpRight className="size-3" /></span>
      </span>
    </Link>
  );
}
