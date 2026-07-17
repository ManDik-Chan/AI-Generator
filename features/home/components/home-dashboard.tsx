import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Brain,
  Image,
  MessageSquareText,
  PenLine,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/page-header";
import { getHomePersonalization } from "@/features/home/data";
import { getTimeGreeting } from "@/features/home/presentation";

const studioCapabilities = [
  { number: "01", title: "私人助手", description: "为不同任务建立专属角色、语气与边界。", action: "进入工作区", href: "/personas", icon: Sparkles },
  { number: "02", title: "长期记忆", description: "查看、修正或关闭 AI 为你整理的重要偏好。", action: "管理记忆", href: "/memories", icon: Brain },
  { number: "03", title: "文本工具", description: "总结、改写、翻译与结构化表达。", action: "打开工具", href: "/tools", icon: PenLine },
  { number: "04", title: "图片理解", description: "从截图、图表与照片中提取关键信息。", action: "分析图片", href: "/tools/image", icon: Image },
] as const;

function AiCoreVisual() {
  return (
    <div aria-hidden="true" className="relative grid min-h-44 place-items-center overflow-hidden min-[1024px]:min-h-full">
      <div className="absolute size-56 rounded-full bg-primary/14 blur-[64px]" />
      <div className="absolute size-48 rounded-full border border-primary/20" />
      <div className="relative z-10 grid size-24 place-items-center rounded-[1.5rem] bg-foreground text-background shadow-raised min-[1181px]:size-28">
        <span className="text-[2rem] font-extrabold tracking-[-.08em] text-[#8ee0c3]">AI</span>
      </div>
    </div>
  );
}

async function HomeWelcome() {
  const { displayName } = await getHomePersonalization();
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Shanghai",
  }).format(new Date()));
  const greeting = getTimeGreeting(hour);
  return <p className="mb-2 mt-5 text-sm font-bold text-muted-foreground">{displayName ? `${greeting}，${displayName}。` : `${greeting}。`}</p>;
}

function ContinueCardFrame({ children, href = "/chat" }: { children: ReactNode; href?: string }) {
  return (
    <Link className="group premium-panel-strong flex min-h-[13.5rem] h-full min-w-0 flex-col p-5 transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raised" href={href}>
      <div className="flex items-start justify-between gap-4">
        <span className="premium-icon-tile size-10 bg-foreground text-background"><MessageSquareText aria-hidden="true" className="size-[1.1rem]" /></span>
        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      {children}
    </Link>
  );
}

function ContinueCardFallback() {
  return (
    <ContinueCardFrame>
      <span className="premium-kicker mt-6">CONTINUE</span>
      <h2 className="mt-2 text-card-title">继续你的工作</h2>
      <p className="mt-2 flex-1 text-supporting">正在读取最近对话；你也可以直接开始新对话。</p>
      <p className="mt-5 text-xs text-muted-foreground">最近记录加载中…</p>
    </ContinueCardFrame>
  );
}

async function ContinueConversationCard() {
  const { latestConversation } = await getHomePersonalization();
  return (
    <ContinueCardFrame href={latestConversation ? `/chat/${latestConversation.id}` : "/chat"}>
      <span className="premium-kicker mt-6">CONTINUE</span>
      <h2 className="mt-2 text-card-title">{latestConversation ? "继续上次的对话" : "开始第一段对话"}</h2>
      <p className="mt-2 flex-1 text-supporting">{latestConversation ? "带着已有上下文，回到你未完成的想法。" : "选择默认助手或专属人格，建立属于你的连续工作空间。"}</p>
      <div className="mt-5 rounded-control border border-border/10 bg-surface-muted/70 px-3 py-2.5">
        <p className="truncate text-xs font-bold">{latestConversation?.title || "还没有最近对话"}</p>
        <p className="mt-1 truncate text-[.625rem] text-muted-foreground">{latestConversation ? `${latestConversation.updatedLabel}${latestConversation.personaName ? ` · ${latestConversation.personaName}` : " · 默认助手"}` : "点击开始，不使用任何虚构记录"}</p>
      </div>
    </ContinueCardFrame>
  );
}

export function HomeDashboard() {
  return (
    <div className="space-y-10 min-[821px]:space-y-12">
      <section className="relative grid min-h-[25rem] overflow-hidden rounded-[1.375rem] border border-border/12 bg-gradient-to-br from-surface-raised via-surface-raised to-primary-subtle shadow-soft min-[1024px]:grid-cols-[minmax(0,1.35fr)_minmax(15rem,.65fr)]">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(circle_at_82%_45%,black,transparent_55%)]" />
        <div className="relative z-10 flex flex-col justify-center px-5 pb-6 pt-8 min-[521px]:px-8 min-[821px]:px-10 min-[1024px]:py-10 min-[1440px]:pl-12">
          <div className="premium-kicker flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/.12)]" />PRIVATE · CALM · POWERFUL</div>
          <Suspense fallback={<p className="mb-2 mt-5 text-sm font-bold text-muted-foreground">欢迎回来。</p>}><HomeWelcome /></Suspense>
          <h1 className="max-w-[43rem] text-balance text-[clamp(2.25rem,3.6vw,3.65rem)] font-[760] leading-[1.02] tracking-[-.055em]">
            <span className="block">把灵感、对话与工具，</span>
            <span className="block text-primary">收进一个人的</span>
            <span className="block text-primary">AI 工作室。</span>
          </h1>
          <p className="mt-5 max-w-[38rem] text-body text-muted-foreground">不堆叠功能，不制造噪音。让常用助手、长期记忆和创作工具，在需要时自然出现。</p>
          <div className="mt-6 flex flex-col gap-2.5 min-[521px]:flex-row">
            <Button asChild size="lg"><Link className="justify-between min-[521px]:min-w-40" href="/chat">开始新对话<ArrowUpRight className="size-4 text-primary" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/personas/new">创建专属助手</Link></Button>
          </div>
        </div>
        <AiCoreVisual />
      </section>

      <section aria-labelledby="quick-start-title">
        <SectionHeader id="quick-start-title" kicker="QUICK START" title="从这里开始" />
        <div className="mt-5 grid items-stretch gap-4 min-[1024px]:grid-cols-3">
          <Suspense fallback={<ContinueCardFallback />}><ContinueConversationCard /></Suspense>
          <Link className="group premium-panel flex min-h-[13.5rem] h-full flex-col p-5 transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-raised hover:shadow-raised" href="/tools"><span className="premium-icon-tile size-10"><Wrench aria-hidden="true" className="size-[1.1rem]" /></span><span className="premium-kicker mt-6">TOOLS</span><h2 className="mt-2 text-card-title">调用工具</h2><p className="mt-2 flex-1 text-supporting">总结、改写、翻译、图片理解与创作。</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-primary">打开工具<ArrowUpRight className="size-3.5" /></span></Link>
          <Link className="group premium-panel flex min-h-[13.5rem] h-full flex-col p-5 transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-raised hover:shadow-raised" href="/memories"><span className="premium-icon-tile size-10"><Brain aria-hidden="true" className="size-[1.1rem]" /></span><span className="premium-kicker mt-6">MEMORY</span><h2 className="mt-2 text-card-title">查看长期记忆</h2><p className="mt-2 flex-1 text-supporting">你决定保留什么，也能随时修改。</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-primary">管理记忆<ArrowUpRight className="size-3.5" /></span></Link>
        </div>
      </section>

      <section aria-labelledby="studio-title">
        <SectionHeader description="每项能力保持独立，但在需要时自然协同。" id="studio-title" kicker="YOUR STUDIO" title="构建你的 AI 工作空间" />
        <div className="mt-5 grid items-stretch gap-4 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {studioCapabilities.map((item) => <Link className="group relative flex min-h-[13rem] h-full flex-col rounded-card border border-border/12 bg-surface/76 p-5 transition-[background-color,border-color,box-shadow,transform] duration-panel hover:-translate-y-0.5 hover:border-primary/25 hover:bg-surface-raised hover:shadow-soft" href={item.href} key={item.number}><span className="absolute right-5 top-5 text-[.625rem] font-extrabold tracking-[.12em] text-muted-foreground">{item.number}</span><span className="premium-icon-tile size-11"><item.icon aria-hidden="true" className="size-5" /></span><h3 className="mt-6 text-card-title">{item.title}</h3><p className="mt-2 flex-1 text-supporting">{item.description}</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-primary">{item.action}<ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>)}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-control border border-border/12 bg-surface-muted/76 p-4 min-[521px]:flex-row min-[521px]:items-center min-[521px]:p-5">
        <span className="premium-icon-tile size-11 shrink-0"><ShieldCheck aria-hidden="true" className="size-5" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">你的内容按用途彼此隔离</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">对话、人格、长期记忆与独立工具各自遵循清晰边界，并可在账号设置中管理。</p></div>
        <Button asChild size="sm" variant="ghost"><Link href="/account">查看设置 <ArrowUpRight className="size-3.5" /></Link></Button>
      </section>
    </div>
  );
}
