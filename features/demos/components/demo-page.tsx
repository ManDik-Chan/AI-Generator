import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BookOpen, Code2 } from "lucide-react";

import { ArrowLink, DemoNotice, Kicker, SectionHead, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { sourceUrl, type DemoEntry } from "@/features/demos/catalog";

/** Editorial header of a demo page: index, title, honest execution facts and the ways in. */
export function DemoPageHeader({ demo, docsHref, children }: { demo: DemoEntry; docsHref: string; children?: ReactNode }) {
  return (
    <header className="pb-8 pt-2 min-[1024px]:pb-10 min-[1024px]:pt-4">
      <div className="enter flex flex-wrap items-center gap-2">
        <Kicker>Demo {demo.index} · {demo.execution === "server" ? "服务端执行" : "浏览器内执行"}</Kicker>
        <ToneBadge dot tone="success">真实执行</ToneBadge>
        <ToneBadge tone="neutral">公开 · 无需登录</ToneBadge>
      </div>
      <div className="mt-4 flex flex-col gap-8 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between">
        <div className="min-w-0 max-w-[52rem]">
          <h1 className="text-balance text-[clamp(2.35rem,5vw,4.4rem)] font-medium leading-[1.04] tracking-[-.04em]">
            <span className="title-line"><span>{demo.name}</span></span>
          </h1>
          <p className="enter mt-4 max-w-[40rem] text-[.9375rem] leading-7 text-muted-foreground" style={delay(220)}>{demo.tagline}</p>
          {children}
        </div>
        <div className="enter flex flex-col gap-2 min-[521px]:flex-row min-[1024px]:shrink-0" style={delay(320)}>
          <Button asChild size="lg" variant="outline"><Link href={docsHref} prefetch={false}><BookOpen className="size-4" />接口文档</Link></Button>
          <Button asChild size="lg" variant="outline"><a href={sourceUrl(demo.sourcePath)} rel="noopener noreferrer" target="_blank"><Code2 className="size-4" />源码<ArrowUpRight className="size-3.5" /></a></Button>
        </div>
      </div>
      <dl className="enter mt-8 grid gap-px overflow-hidden rounded-card bg-border/10 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-4" style={delay(380)}>
        {demo.facts.map(([label, value]) => (
          <div className="bg-surface px-4 py-3" key={label}>
            <dt className="text-[.6875rem] text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-[.8125rem] font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/** "How it works" in three numbered columns plus the honest boundary of the demo. */
export function HowItWorks({ steps, boundary, links }: { steps: [string, string][]; boundary: ReactNode; links: { href: string; label: string; external?: boolean }[] }) {
  return (
    <section aria-labelledby="how-it-works" className="mt-20">
      <SectionHead id="how-it-works">它是怎么运行的</SectionHead>
      <ol className="grid gap-0.5 min-[821px]:grid-cols-3">
        {steps.map(([title, detail], index) => (
          <li className="enter flex min-h-[12rem] flex-col rounded-card bg-surface p-5" key={title} style={delay(60 + index * 60)}>
            <span className="text-[clamp(2rem,3vw,2.6rem)] font-medium leading-none tracking-[-.05em] text-muted-foreground/70">0{index + 1}</span>
            <span className="mt-auto pt-8 text-[1.0625rem] font-medium tracking-[-.015em]">{title}</span>
            <span className="mt-1.5 text-[.8125rem] leading-5 text-muted-foreground">{detail}</span>
          </li>
        ))}
      </ol>
      <DemoNotice className="mt-4" label="边界">{boundary}</DemoNotice>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        {links.map((link) => <ArrowLink external={link.external} href={link.href} key={link.href}>{link.label}</ArrowLink>)}
      </div>
    </section>
  );
}
