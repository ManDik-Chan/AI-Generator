import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";

import { ArtSurface } from "@/components/platform/art";
import { ToneBadge } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { demos } from "@/features/demos/catalog";

/** Lab tab of a runnable demo project: the facts and the way into the full workbench. */
export function LaunchLab({ slug }: { slug: "route-optimizer" | "neural-network" }) {
  const demo = demos.find((item) => item.slug === slug)!;
  const docs = demo.execution === "server" ? "/docs/api#route-optimizer-solve" : "/docs/guide#浏览器运行时";
  return (
    <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <ArtSurface className="flex min-h-[20rem] flex-col justify-end rounded-card p-6" k={demo.art}>
        <div className="max-w-[30rem] rounded-card bg-[hsl(var(--paper)/.94)] p-5 text-[hsl(var(--ink))]">
          <p className="flex flex-wrap items-center gap-2 text-[.75rem] text-[hsl(var(--ink)/.6)]">实验室 · 真实执行 <ToneBadge tone="success">{demo.execution === "server" ? "服务端" : "浏览器内"}</ToneBadge></p>
          <p className="mt-1 text-[1.5rem] font-medium leading-tight tracking-[-.03em]">{demo.tagline}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm"><Link href={demo.href} prefetch={false}>打开 Demo<ArrowUpRight className="size-3.5" /></Link></Button>
            <Button asChild size="sm" variant="outline"><Link href={docs} prefetch={false}><BookOpen className="size-3.5" />接口文档</Link></Button>
          </div>
        </div>
      </ArtSurface>
      <div className="rounded-card bg-surface p-5">
        <dl>
          {demo.facts.map(([label, value]) => (
            <div className="border-b border-border/12 py-3 first:pt-0" key={label}>
              <dt className="text-[.75rem] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[.75rem] text-muted-foreground">可以试试</p>
        <ul className="mt-2 space-y-1.5 text-[.8125rem] leading-5">
          {demo.tryList.map((item) => <li className="flex gap-2" key={item}><span aria-hidden="true" className="mt-[.45rem] size-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]" />{item}</li>)}
        </ul>
      </div>
    </div>
  );
}
