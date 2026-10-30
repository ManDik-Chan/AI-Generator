import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { ArtSurface } from "@/components/platform/art";
import { StatusPill } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import type { PlatformProject } from "@/features/platform/types";

/** The platform's own "lab" is the live AI Hub: no simulation, just the way in. */
export function HubLab({ project }: { project: PlatformProject }) {
  const live = project.capabilities.filter((capability) => capability.status === "live");
  return (
    <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <ArtSurface className="flex min-h-[20rem] flex-col justify-end rounded-card p-6" k="agents">
        <div className="max-w-[28rem] rounded-card bg-[hsl(var(--paper)/.94)] p-5 text-[hsl(var(--ink))]">
          <p className="text-[.75rem] text-[hsl(var(--ink)/.6)]">实验室 · 真实可用</p>
          <p className="mt-1 text-[1.5rem] font-medium leading-tight tracking-[-.03em]">这个项目的实验室，就是已经上线的 AI Hub。</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm"><Link href="/login" prefetch={false}>登录使用<ArrowUpRight className="size-3.5" /></Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/platform/hub" prefetch={false}>先浏览演示工作台</Link></Button>
          </div>
        </div>
      </ArtSurface>
      <ul className="rounded-card bg-surface p-5">
        {live.map((capability) => (
          <li className="border-b border-border/12 py-4 first:pt-0 last:border-0" key={capability.id}>
            <span className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{capability.label}</span><StatusPill status={capability.status} /></span>
            <span className="mt-1 block text-[.8125rem] leading-5 text-muted-foreground">{capability.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
