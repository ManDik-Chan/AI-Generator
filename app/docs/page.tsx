import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Kicker, LoopArrow, SectionHead, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { demos } from "@/features/demos/catalog";
import { DocMarkdown, statusBadges } from "@/features/docs/components/doc-markdown";
import { DocsFrame } from "@/features/docs/components/docs-shell";

export const dynamic = "force-static";

export const metadata: Metadata = { title: { absolute: "开发者文档 · AI-Generator" } };

const sections = [
  { href: "/docs/guide", index: "01", title: "开发者手册", detail: "环境、最小接入示例、服务端能力与浏览器运行时的写法、调试、排错、安全与发布。" },
  { href: "/docs/api", index: "02", title: "API Reference", detail: "运行生命周期、数据结构、端点、事件流、错误码、认证边界与版本规则；附在线请求。" },
  { href: "/docs/manifest", index: "03", title: "Manifest 与能力描述符", detail: "P0.5 项目 Manifest 的每个字段与校验，能力描述符 aig.capability/0.1。" },
  { href: "/docs/status", index: "04", title: "接口清单", detail: "哪些已经实现，哪些是 Demo 专用的取舍，哪些只是设计契约，以及下一阶段的接入点。" },
];

const statusNotes: Record<string, string> = {
  "status:demo": "公开可调用，有校验、限流与资源上限；用于体验和接入参考。",
  "status:implemented": "已实现并有测试的库与协议，在本仓库中直接可用。",
  "status:internal": "已上线，但只供本站前端使用，需要登录，不对第三方开放。",
  "status:design": "设计契约，尚未部署；调用会得到 404。",
};

const pipeline: { title: string; detail: string; status: keyof typeof statusBadges }[] = [
  { title: "Manifest", detail: "项目是什么：名称、类别、可见性、研究声明", status: "status:implemented" },
  { title: "Registry", detail: "创建项目、独立审核、发布不可变版本", status: "status:design" },
  { title: "能力描述符", detail: "能运行什么：输入输出 Schema、上限、数据去向", status: "status:implemented" },
  { title: "运行", detail: "PENDING → ACCEPTED → RUNNING → 终态", status: "status:demo" },
];

const quickstart = [
  "```bash",
  "# 1. 看看有哪些能力（无需登录、无需密钥）",
  "curl -s https://<本站域名>/api/demo/v1/capabilities",
  "",
  "# 2. 运行一次：服务端为 120 个城市求路线",
  "curl -s -X POST https://<本站域名>/api/demo/v1/runs \\",
  "  -H 'Content-Type: application/json' \\",
  `  -d '{"capability":"route-optimizer.solve","input":{"instance":{"kind":"clustered","count":120,"seed":7},"improvement":"or-opt"}}'`,
  "",
  "# 3. 在本地校验你自己的 Manifest",
  "pnpm manifest:validate path/to/manifest.json",
  "```",
].join("\n");

export default function DocsHomePage() {
  return (
    <DocsFrame active="/docs">
      <div className="pb-8">
        <header className="max-w-[54rem]">
          <div className="enter flex flex-wrap items-center gap-2">
            <Kicker>开发者 · Developers</Kicker>
          </div>
          <h1 className="mt-4 text-balance text-[clamp(2.35rem,5vw,4.4rem)] font-medium leading-[1.04] tracking-[-.04em]">
            <span className="title-line"><span>把你的项目，</span></span>
            <span className="title-line" style={delay(90)}><span>接到 AI-Generator。</span></span>
          </h1>
          <p className="enter mt-5 max-w-[42rem] text-[.9375rem] leading-7 text-muted-foreground" style={delay(260)}>
            这里说明如何把算法、模型或应用整理成平台能理解的形式：用 Manifest 描述项目，用能力描述符声明可运行的部分，用同一套运行状态机执行。两个公开 Demo 是完整的参考实现，代码、接口与文档相互一致，并由自动化测试保证。
          </p>
          <div className="enter mt-6 flex flex-col gap-2 min-[521px]:flex-row" style={delay(320)}>
            <Button asChild size="lg"><Link href="/docs/guide" prefetch={false}>开始阅读手册</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/docs/api" prefetch={false}>API Reference</Link></Button>
          </div>
        </header>

        <section aria-labelledby="docs-status" className="mt-16">
          <SectionHead id="docs-status">先看状态</SectionHead>
          <ul className="grid gap-0.5 min-[640px]:grid-cols-2">
            {Object.entries(statusBadges).map(([key, badge], index) => (
              <li className="enter flex min-h-[7.5rem] flex-col justify-between rounded-card bg-surface p-5" key={key} style={delay(60 + index * 50)}>
                <ToneBadge className="self-start" tone={badge.tone}>{badge.label}</ToneBadge>
                <p className="mt-4 text-[.8125rem] leading-5 text-muted-foreground">{statusNotes[key]}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[.75rem] leading-5 text-muted-foreground">Registry、第三方能力注册、异步远程运行（L2）、Grant 与 BYOK 都还没有部署。文档中凡是没有标注为已实现的内容，都不能当作线上接口使用。</p>
        </section>

        <section aria-labelledby="docs-sections" className="mt-16">
          <SectionHead id="docs-sections">文档</SectionHead>
          <div className="grid gap-0.5 min-[821px]:grid-cols-2">
            {sections.map((section, index) => (
              <Link className="enter group flex min-h-[11rem] flex-col rounded-card bg-surface p-5 transition-colors duration-500 hover:bg-surface-muted" href={section.href} key={section.href} prefetch={false} style={delay(60 + index * 60)}>
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[clamp(1.75rem,2.6vw,2.25rem)] font-medium leading-none tracking-[-.05em] text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">{section.index}</span>
                  <LoopArrow className="text-muted-foreground" dir="ur" />
                </span>
                <span className="mt-auto pt-8 text-[1.0625rem] font-medium tracking-[-.015em]">{section.title}</span>
                <span className="mt-1.5 text-[.8125rem] leading-5 text-muted-foreground">{section.detail}</span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="docs-architecture" className="mt-16">
          <SectionHead id="docs-architecture">接入的四个环节</SectionHead>
          <ol className="grid gap-0.5 min-[821px]:grid-cols-4">
            {pipeline.map((step, index) => (
              <li className="relative flex min-h-[10rem] flex-col rounded-card bg-surface p-5" key={step.title}>
                <span className="font-code text-[.6875rem] text-muted-foreground">0{index + 1}</span>
                <span className="mt-3 text-[1.0625rem] font-medium tracking-[-.015em]">{step.title}</span>
                <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{step.detail}</span>
                <ToneBadge className="mt-auto self-start pt-0.5" tone={statusBadges[step.status].tone}>{statusBadges[step.status].label}</ToneBadge>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="docs-quickstart" className="mt-16 max-w-[52rem]">
          <SectionHead id="docs-quickstart">三条命令开始</SectionHead>
          <DocMarkdown text={quickstart} />
          <p className="text-[.75rem] leading-5 text-muted-foreground">把 <code className="font-code">&lt;本站域名&gt;</code> 换成当前访问的域名，或在本地运行 <code className="font-code">pnpm dev</code> 后使用 <code className="font-code">http://localhost:3000</code>。</p>
        </section>

        <section aria-labelledby="docs-reference" className="mt-16">
          <SectionHead id="docs-reference">参考实现</SectionHead>
          <ul className="grid gap-0.5 min-[821px]:grid-cols-2">
            {demos.map((demo) => (
              <li className="flex flex-col rounded-card bg-surface p-5" key={demo.slug}>
                <span className="font-code text-[.6875rem] text-muted-foreground">Demo {demo.index} · {demo.capability} · execution: {demo.execution}</span>
                <span className="mt-3 text-[1.25rem] font-medium tracking-[-.02em]">{demo.name}</span>
                <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{demo.tagline}</span>
                <span className="mt-5 flex flex-wrap gap-2">
                  <Button asChild size="sm"><Link href={demo.href} prefetch={false}>打开 Demo<ArrowUpRight className="size-3.5" /></Link></Button>
                  <Button asChild size="sm" variant="outline"><Link href={demo.execution === "server" ? "/docs/guide#服务端能力" : "/docs/guide#浏览器运行时"} prefetch={false}>实现说明</Link></Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DocsFrame>
  );
}
