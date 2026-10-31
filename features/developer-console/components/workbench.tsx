import Link from "next/link";
import { BookOpen, FileCheck2, FlaskConical, GitPullRequestArrow } from "lucide-react";

import { ArrowLink, DemoNotice, PageIntro, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { demos } from "@/features/demos/catalog";
import { designedEndpoints, liveOperations, registryFunctions } from "@/features/developer-console/api-catalog";
import { ProjectList } from "@/features/developer-console/components/project-list";
import { contractMeta, type ContractStatus } from "@/features/developer-console/permissions";
import { cn } from "@/lib/utils";

const contractTone: Record<ContractStatus, "success" | "warning" | "neutral"> = { merged: "success", provisional: "warning", gap: "neutral" };

const pipeline: { step: string; title: string; detail: string; actor: string; contract: ContractStatus; source: string }[] = [
  { step: "01", title: "项目", detail: "slug 与所有者不可变，项目永不硬删除，slug 永不复用。", actor: "内部创建资格", contract: "merged", source: "P1-B1" },
  { step: "02", title: "草稿", detail: "整份 payload 替换；每个写请求带强 ETag 与幂等键。", actor: "所有者 · 编辑", contract: "merged", source: "P1-B2-A" },
  { step: "03", title: "审核", detail: "冻结内容哈希与 15 分钟期限，审核人不能是提交人。", actor: "审核人", contract: "merged", source: "P1-B2-A" },
  { step: "04", title: "版本", detail: "已批准内容原子封存为不可变 Version，草稿随之冻结。", actor: "所有者 · 编辑", contract: "merged", source: "P1-B2-A" },
  { step: "05", title: "发布", detail: "独立批准后切换当前 Release；撤回与回滚都追加新事实。", actor: "所有者 · 发布 + 审核", contract: "merged", source: "P1-B2-B" },
];

/** Overview of the developer console: projects, the pipeline, live demos and readiness. */
export function Workbench({ base, projectsBase }: { base: string; projectsBase: string }) {
  const live = liveOperations();
  const merged = registryFunctions.filter((item) => item.contract === "merged").length;
  const readiness = [
    { label: "可直接调用", count: live.length, unit: "个 HTTP 操作", tone: "success" as const, detail: "Demo Runtime API，公开、无需登录、按客户端限流。", href: "/docs/api", link: "API Reference" },
    { label: "内部库，无 HTTP", count: merged, unit: "个函数", tone: "info" as const, detail: "Registry 草稿、审核、版本与发布协议；默认关闭，只在服务端调用。", href: `${base}/integrate#registry`, link: "查看函数" },
    { label: "设计中", count: designedEndpoints.length, unit: "个端点", tone: "neutral" as const, detail: "公开读取、安装、授权与异步运行；调用会得到 404。", href: `${base}/integrate#designed`, link: "查看草案" },
  ];

  return (
    <div className="pb-6">
      <PageIntro
        actions={(
          <>
            <Button asChild size="lg"><Link href={`${base}/projects/air-quality`} prefetch={false}><GitPullRequestArrow className="size-4" />打开发布台</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href={`${base}/integrate`} prefetch={false}>接入指南</Link></Button>
          </>
        )}
        description="管理项目从草稿、独立审核、不可变版本到发布的全过程，查看接口就绪度、权限与数据边界。草稿、审核、版本与发布的规则都来自已合并的 Registry 协议（P1-B2-A、P1-B2-B）；数据来自 Mock。"
        kicker="开发者控制台 · Developer Console"
        meta={<StatusPill status="dev" />}
        title={["从草稿到发布，", "每一步都有据可查。"]}
      />

      <DemoNotice className="mb-14" label="Mock 数据源">
        Registry 还没有写入接口（只读接口仅供登录后的「Registry 只读」模式使用，默认关闭），这里的完整流程通过一个类型化的 Mock Adapter 运行：规则、ETag、错误码与真实协议一致，但身份可以切换、数据只在本标签页内存中，刷新即重置，不会调用任何服务或保存任何内容。
      </DemoNotice>

      <section aria-labelledby="wb-projects" id="projects">
        <SectionHead id="wb-projects" meta={<ToneBadge tone="warning">示例项目</ToneBadge>} action={<ArrowLink href={projectsBase}>项目控制台</ArrowLink>}>我的项目</SectionHead>
        <ProjectList base={base} />
      </section>

      <section aria-labelledby="wb-pipeline" className="mt-20">
        <SectionHead id="wb-pipeline">发布流程</SectionHead>
        <ol className="grid gap-0.5 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-5">
          {pipeline.map((item, index) => (
            <li className={cn("enter flex min-h-[14rem] flex-col rounded-card p-5", item.contract === "merged" ? "bg-surface" : "demo-outline")} key={item.step} style={delay(60 + index * 60)}>
              <span className="flex items-center justify-between gap-2">
                <span className="font-code text-[.75rem] text-muted-foreground">{item.step}</span>
                <ToneBadge tone={contractTone[item.contract]}>{contractMeta[item.contract].label}</ToneBadge>
              </span>
              <span className="mt-auto pt-8 text-[1.25rem] font-medium tracking-[-.02em]">{item.title}</span>
              <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{item.detail}</span>
              <span className="mt-3 border-t border-border/12 pt-2 text-[.6875rem] text-muted-foreground">{item.actor} · {item.source}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="wb-ready" className="mt-20">
        <SectionHead id="wb-ready" action={<ArrowLink href="/docs/status">完整接口清单</ArrowLink>}>接口就绪度</SectionHead>
        <div className="grid gap-0.5 min-[821px]:grid-cols-3">
          {readiness.map((item) => (
            <div className="flex min-h-[12rem] flex-col rounded-card bg-surface p-5" key={item.label}>
              <ToneBadge className="self-start" dot tone={item.tone}>{item.label}</ToneBadge>
              <p className="mt-auto pt-8"><span className="text-[clamp(2rem,3vw,2.6rem)] font-medium leading-none tracking-[-.05em] tabular-nums">{item.count}</span><span className="ml-2 text-[.8125rem] text-muted-foreground">{item.unit}</span></p>
              <p className="mt-2 text-[.8125rem] leading-5 text-muted-foreground">{item.detail}</p>
              <ArrowLink className="mt-4" href={item.href}>{item.link}</ArrowLink>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="wb-demos" className="mt-20">
        <SectionHead id="wb-demos" meta={<ToneBadge dot tone="success">真实 · 已上线</ToneBadge>} action={<ArrowLink href="/demos">全部 Demo</ArrowLink>}>可运行的参考实现</SectionHead>
        <ul className="grid gap-0.5 min-[821px]:grid-cols-2">
          {demos.map((demo) => (
            <li className="flex flex-col rounded-card bg-surface p-5" key={demo.slug}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-code text-[.75rem] text-muted-foreground">{demo.index} · {demo.capability}</span>
                <ToneBadge tone={demo.execution === "server" ? "info" : "lime"}>{demo.execution === "server" ? "服务端执行" : "浏览器执行"}</ToneBadge>
              </span>
              <span className="mt-6 text-[1.125rem] font-medium tracking-[-.015em]">{demo.name}</span>
              <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{demo.tagline}</span>
              <dl className="mt-4 border-t border-border/12">
                {demo.facts.slice(0, 2).map(([label, value]) => (
                  <div className="spec-row" key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-right text-[.75rem] font-medium">{value}</dd></div>
                ))}
              </dl>
              <span className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                <ArrowLink href={demo.href}>运行 Demo</ArrowLink>
                <ArrowLink href={`/explore/${demo.slug}`}>项目展示页</ArrowLink>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="wb-start" className="mt-20">
        <SectionHead id="wb-start">从这里开始</SectionHead>
        <ol className="grid gap-0.5 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {[
            { icon: BookOpen, title: "读开发者手册", detail: "接入方式、能力描述符与运行状态机。", href: "/docs/guide", link: "开发者手册" },
            { icon: FileCheck2, title: "校验 Manifest", detail: "在浏览器里按 0.5.0 契约逐字段检查。", href: `${base}/integrate#manifest`, link: "打开校验器" },
            { icon: GitPullRequestArrow, title: "走一遍发布流程", detail: "切换身份，体会独立审核与 ETag。", href: `${base}/projects/sorting-lab`, link: "排序实验发布台" },
            { icon: FlaskConical, title: "调用 Demo API", detail: "真实 HTTP，JSON 或事件流。", href: "/docs/api", link: "在线请求" },
          ].map((item, index) => (
            <li className="flex min-h-[11rem] flex-col rounded-card bg-surface p-5" key={item.title}>
              <span className="flex items-center justify-between"><item.icon aria-hidden="true" className="size-5" /><span className="font-code text-[.75rem] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span></span>
              <span className="mt-auto pt-6 text-sm font-medium">{item.title}</span>
              <span className="mt-1 text-[.75rem] leading-5 text-muted-foreground">{item.detail}</span>
              <ArrowLink className="mt-3" href={item.href}>{item.link}</ArrowLink>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
