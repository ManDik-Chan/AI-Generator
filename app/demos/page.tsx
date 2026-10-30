import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";

import { ArtSurface } from "@/components/platform/art";
import { ArrowLink, LoopArrow, PageIntro, SectionHead, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { demos } from "@/features/demos/catalog";

export const metadata: Metadata = { title: { absolute: "可运行的 Demo · AI-Generator" } };

const comparison: [string, string, string][] = [
  ["执行位置", "平台服务端（Vercel Function，Node.js）", "访客的浏览器（Web Worker）"],
  ["调用方式", "HTTP：JSON 一次返回，或 SSE 事件流", "postMessage：aig.worker/1 协议"],
  ["数据去向", "发送到平台，仅用于本次计算，不保存", "不离开设备"],
  ["资源上限", "64 KiB 请求体 · 5 s 截止 · 限流", "单次运行 60 s · 网络 ≤ 4 × 8"],
  ["适合的项目", "算法服务、需要服务端资源或私有实现的能力", "可视化、交互式教学、隐私敏感的本地计算"],
];

const labs = [
  { href: "/explore/sorting-lab#lab", name: "排序算法对照实验", detail: "示例项目 · 浏览器内逐步运行三种排序并计数比较次数" },
  { href: "/explore/volume-reconstruction#lab", name: "体数据三维重建", detail: "示例项目 · 合成体数据的切片、阈值与点云（非临床）" },
];

export default function DemosPage() {
  return (
    <div className="mx-auto max-w-[100rem] px-4 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10">
      <PageIntro
        actions={<Button asChild size="lg" variant="outline"><Link href="/docs" prefetch={false}><BookOpen className="size-4" />开发者文档</Link></Button>}
        description="两个能直接上手的 Demo，各自代表一种接入方式：一个在平台服务端执行，一个在你的浏览器里执行。参数由你改，结果当场算出；它们的接口、源码与文档都公开，可以照着把自己的项目接进来。"
        kicker="Demo · 亲手运行"
        meta={<ToneBadge dot tone="success">真实执行 · 无需登录</ToneBadge>}
        title={["不是录屏，", "是真的在运行。"]}
      />

      <section aria-label="Demo 列表" className="grid gap-x-4 gap-y-14 min-[1024px]:grid-cols-2">
        {demos.map((demo, index) => (
          <article className="enter flex min-w-0 flex-col" key={demo.slug} style={delay(120 + index * 90)}>
            <Link className="group block" href={demo.href} prefetch={false}>
              <ArtSurface className="aspect-[16/10] w-full rounded-card" k={demo.art} zoom>
                <span className="absolute left-4 top-4 rounded-full bg-[hsl(var(--paper)/.92)] px-3 py-1.5 text-[.75rem] font-medium text-[hsl(var(--ink))]">Demo {demo.index} · {demo.execution === "server" ? "服务端执行" : "浏览器内执行"}</span>
                <span className="absolute bottom-4 left-4 rounded-full bg-[hsl(var(--ink)/.55)] px-2.5 py-1 font-code text-[.6875rem] text-[hsl(var(--paper))] backdrop-blur-sm">{demo.capability}</span>
              </ArtSurface>
            </Link>
            <div className="mt-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-code text-[.75rem] text-muted-foreground">{demo.english}</p>
                <h2 className="mt-1 text-[clamp(1.75rem,2.6vw,2.4rem)] font-medium leading-[1.08] tracking-[-.035em]">
                  <Link className="link-grow" href={demo.href} prefetch={false}>{demo.name}</Link>
                </h2>
                <p className="mt-2 max-w-[34rem] text-[.9375rem] leading-7 text-muted-foreground">{demo.tagline}</p>
              </div>
              <LoopArrow className="mt-2 shrink-0 text-xl text-muted-foreground" dir="ur" />
            </div>
            <dl className="mt-5 border-t border-border/12">
              {demo.facts.map(([label, value]) => (
                <div className="flex items-baseline justify-between gap-4 border-b border-border/12 py-2.5" key={label}>
                  <dt className="shrink-0 text-[.75rem] text-muted-foreground">{label}</dt>
                  <dd className="text-right text-[.8125rem] font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-[.75rem] text-muted-foreground">可以试试</p>
            <ul className="mt-2 space-y-1.5 text-[.8125rem] leading-5">
              {demo.tryList.map((item) => <li className="flex gap-2" key={item}><span aria-hidden="true" className="mt-[.45rem] size-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]" />{item}</li>)}
            </ul>
            <div className="mt-6 flex flex-col gap-2 min-[521px]:flex-row">
              <Button asChild size="lg"><Link href={demo.href} prefetch={false}>打开 Demo<ArrowUpRight className="size-4" /></Link></Button>
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="two-runtimes" className="mt-24">
        <SectionHead id="two-runtimes" meta={<span className="text-caption">同一套运行状态 · 两种执行位置</span>}>两种接入方式</SectionHead>
        <div className="overflow-x-auto rounded-card bg-surface">
          <table className="w-full min-w-[40rem] text-left text-[.8125rem]">
            <thead>
              <tr className="border-b border-border/12 text-[.75rem] text-muted-foreground">
                <th className="w-[18%] px-4 py-3 font-normal" scope="col"><span className="sr-only">维度</span></th>
                <th className="px-4 py-3 font-medium text-foreground" scope="col">Demo 01 · 服务端能力</th>
                <th className="px-4 py-3 font-medium text-foreground" scope="col">Demo 02 · 浏览器能力</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(([label, server, browser]) => (
                <tr className="border-b border-border/10 last:border-0" key={label}>
                  <th className="px-4 py-3 align-top text-[.75rem] font-normal text-muted-foreground" scope="row">{label}</th>
                  <td className="px-4 py-3 align-top">{server}</td>
                  <td className="px-4 py-3 align-top">{browser}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[48rem] text-[.75rem] leading-5 text-muted-foreground">两者都用 PENDING → ACCEPTED → RUNNING → SUCCEEDED / FAILED / CANCELLED / TIMED_OUT 描述一次运行，并用同一份能力描述符（aig.capability/0.1）声明输入、输出、限制与数据去向。</p>
      </section>

      <section aria-labelledby="more-labs" className="mt-24">
        <SectionHead action={<ArrowLink href="/explore">全部项目</ArrowLink>} id="more-labs">更多实验室</SectionHead>
        <ul className="grid gap-0.5 min-[821px]:grid-cols-2">
          {labs.map((lab) => (
            <li key={lab.href}>
              <Link className="group flex min-h-[7rem] flex-col justify-between rounded-card bg-surface p-5 transition-colors duration-500 hover:bg-surface-muted" href={lab.href} prefetch={false}>
                <span className="flex items-center justify-between gap-3 text-[1.0625rem] font-medium tracking-[-.015em]"><span className="link-grow">{lab.name}</span><LoopArrow className="text-muted-foreground" dir="ur" /></span>
                <span className="mt-4 text-[.8125rem] leading-5 text-muted-foreground">{lab.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-24 flex flex-col gap-6 rounded-card bg-surface p-6 min-[821px]:flex-row min-[821px]:items-end min-[821px]:justify-between min-[821px]:p-10">
        <div className="max-w-[38rem]">
          <p className="kicker">接入你的项目<span aria-hidden="true" className="kicker__arrow">↓</span></p>
          <p className="mt-4 text-[clamp(1.6rem,2.6vw,2.4rem)] font-medium leading-[1.12] tracking-[-.035em]">照着这两个 Demo 的契约，把你的算法、模型或应用接进来。</p>
        </div>
        <div className="flex flex-col gap-2 min-[521px]:flex-row">
          <Button asChild size="lg"><Link href="/docs/guide" prefetch={false}>开发者手册</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/docs/api" prefetch={false}>API Reference</Link></Button>
        </div>
      </section>
    </div>
  );
}
