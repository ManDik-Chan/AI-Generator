import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  BrainCircuit,
  History,
  Image,
  ImagePlus,
  MessageSquareText,
  PenLine,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/page-header";
import { getHomePersonalization } from "@/features/home/data";
import { getTimeGreeting } from "@/features/home/presentation";

const capabilities = [
  { number: "01", title: "专属人格", description: "为不同任务建立独立角色、语气和边界。", action: "管理助手", href: "/personas", icon: Sparkles },
  { number: "02", title: "长期记忆", description: "查看、修正或关闭 AI 整理的重要偏好。", action: "管理记忆", href: "/memories", icon: Brain },
  { number: "03", title: "文本工具", description: "总结、改写、翻译与结构化表达。", action: "打开工具", href: "/tools", icon: PenLine },
  { number: "04", title: "图片理解", description: "从截图、图表和照片中提取关键信息。", action: "分析图片", href: "/tools/image", icon: Image },
  { number: "05", title: "图片生成", description: "每次生成一张图片并保存到私有空间。", action: "开始创作", href: "/tools/image-generate", icon: ImagePlus },
  { number: "06", title: "多 Agent", description: "四个固定 Worker 分析，再由协调器综合。", action: "协作思考", href: "/tools/brainstorm", icon: BrainCircuit },
  { number: "07", title: "运行历史", description: "查看真实工具状态、结果、恢复与下载。", action: "查看记录", href: "/tools/history", icon: History },
  { number: "08", title: "账户与隐私", description: "管理身份、主题和清晰的数据边界。", action: "打开设置", href: "/account", icon: UserRound },
] as const;

function LumenCoreVisual() {
  return (
    <div aria-hidden="true" className="relative grid min-h-[18rem] place-items-center overflow-hidden min-[1024px]:min-h-full">
      <div className="absolute size-[18rem] rounded-full border border-primary/18" />
      <div className="premium-orbit absolute size-[14rem] rounded-full border border-dashed border-primary/20" />
      <div className="absolute size-[10rem] rounded-full border border-secondary/16" />
      <div className="absolute left-[8%] top-[20%] rounded-control border border-border/12 bg-background/65 px-3 py-2 text-[.625rem] text-muted-foreground backdrop-blur"><span className="mr-2 inline-block size-1.5 rounded-full bg-primary" />长期记忆</div>
      <div className="absolute right-[6%] top-[28%] rounded-control border border-border/12 bg-background/65 px-3 py-2 text-[.625rem] text-muted-foreground backdrop-blur"><span className="mr-2 inline-block size-1.5 rounded-full bg-secondary" />图像创作</div>
      <div className="absolute bottom-[16%] left-[9%] rounded-control border border-border/12 bg-background/65 px-3 py-2 text-[.625rem] text-muted-foreground backdrop-blur"><span className="mr-2 inline-block size-1.5 rounded-full bg-accent" />智能人格</div>
      <div className="absolute bottom-[13%] right-[8%] rounded-control border border-border/12 bg-background/65 px-3 py-2 text-[.625rem] text-muted-foreground backdrop-blur"><span className="mr-2 inline-block size-1.5 rounded-full bg-accent-gold" />多 Agent</div>
      <div className="premium-float relative z-10 grid size-24 -rotate-6 place-items-center rounded-[1.65rem] bg-gradient-to-br from-primary to-[#4f7dff] text-white shadow-[0_22px_60px_hsl(var(--primary)/.3)] min-[1181px]:size-28">
        <span className="text-[2.35rem] font-black tracking-[-.08em]">L</span>
      </div>
    </div>
  );
}

async function HomeWelcome() {
  const { displayName } = await getHomePersonalization();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Shanghai" }).format(new Date()));
  const greeting = getTimeGreeting(hour);
  return <p className="mb-3 mt-5 text-sm font-bold text-muted-foreground">{displayName ? `${greeting}，${displayName}。` : `${greeting}。`}</p>;
}

function QuickCard({ children, href, icon: Icon }: { children: ReactNode; href: string; icon: typeof MessageSquareText }) {
  return <Link className="group flex min-h-[9.5rem] flex-col rounded-control border border-border/12 bg-surface/58 p-4 transition hover:-translate-y-0.5 hover:border-primary/28 hover:bg-surface-raised hover:shadow-soft" href={href}><span className="premium-icon-tile size-10"><Icon className="size-4" /></span>{children}<ArrowUpRight className="ml-auto mt-auto size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /></Link>;
}

function OverviewFallback() {
  return <div className="grid gap-4 min-[1024px]:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]"><div className="premium-panel h-52 animate-pulse motion-reduce:animate-none" /><div className="premium-panel h-52 animate-pulse motion-reduce:animate-none" /></div>;
}

async function HomeOverview() {
  const { recentConversations, metrics, isAdmin } = await getHomePersonalization();
  const metricItems = metrics ? [
    { label: "活跃对话", value: metrics.conversations, icon: MessageSquareText },
    { label: "专属人格", value: metrics.personas, icon: Sparkles },
    { label: "启用记忆", value: metrics.memories, icon: Brain },
    { label: "图片作品", value: metrics.generatedImages, icon: ImagePlus },
  ] : [];

  return <>
    <div className="grid gap-4 min-[1024px]:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]">
      <section className="premium-panel p-4 sm:p-5" aria-labelledby="quick-title">
        <SectionHeader action={<Button asChild size="sm" variant="ghost"><Link href="/tools">全部工具<ArrowRight className="size-3.5" /></Link></Button>} description="从最常用的真实工作流开始" id="quick-title" title="快速启动" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <QuickCard href={recentConversations[0] ? `/chat/${recentConversations[0].id}` : "/chat"} icon={MessageSquareText}><p className="mt-4 text-sm font-bold">{recentConversations[0] ? "继续上次对话" : "开始第一段对话"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{recentConversations[0]?.title ?? "选择默认助手或专属人格"}</p></QuickCard>
          <QuickCard href="/tools/image-generate" icon={ImagePlus}><p className="mt-4 text-sm font-bold">生成视觉素材</p><p className="mt-1 text-xs leading-5 text-muted-foreground">创建单张私有图片作品</p></QuickCard>
          <QuickCard href="/personas" icon={Sparkles}><p className="mt-4 text-sm font-bold">切换专属人格</p><p className="mt-1 text-xs leading-5 text-muted-foreground">用不同角色处理任务</p></QuickCard>
        </div>
      </section>
      <section className="premium-panel p-4 sm:p-5" aria-labelledby="recent-title">
        <SectionHeader action={<Button asChild size="sm" variant="ghost"><Link href="/chat">打开<ArrowRight className="size-3.5" /></Link></Button>} description="跨设备继续你的上下文" id="recent-title" title="最近对话" />
        <div className="mt-4 space-y-2.5">{recentConversations.length ? recentConversations.map((conversation) => <Link className="flex min-h-16 items-center gap-3 rounded-control border border-border/10 bg-surface-muted/55 px-3.5 py-3 transition hover:border-primary/25 hover:bg-surface-raised" href={`/chat/${conversation.id}`} key={conversation.id} prefetch={false}><span className="premium-icon-tile size-9 shrink-0"><MessageSquareText className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{conversation.title}</span><span className="mt-1 block truncate text-[.625rem] text-muted-foreground">{conversation.personaName ?? "默认助手"} · {conversation.updatedLabel}</span></span><ArrowRight className="size-3.5 text-muted-foreground" /></Link>) : <div className="rounded-control border border-dashed border-border/14 px-4 py-8 text-center"><p className="text-sm font-bold">还没有最近对话</p><p className="mt-1 text-xs text-muted-foreground">开始后会显示真实记录，不使用任何虚构数据。</p></div>}</div>
      </section>
    </div>
    {metricItems.length ? <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="真实工作空间概览">{metricItems.map((metric) => <div className="premium-panel flex items-center gap-4 p-4" key={metric.label}><span className="premium-icon-tile size-10 shrink-0"><metric.icon className="size-4" /></span><div><p className="text-2xl font-semibold tabular-nums">{metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.label}</p></div></div>)}</section> : null}
    {isAdmin ? <div className="mt-4 flex items-center gap-3 rounded-control border border-info/18 bg-info-subtle/72 p-4"><ShieldCheck className="size-5 text-info" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">管理员工作空间</p><p className="mt-1 text-xs text-muted-foreground">用户、用量、角色和系统状态入口仅对管理员可见。</p></div><Button asChild size="sm" variant="outline"><Link href="/admin">系统管理</Link></Button></div> : null}
  </>;
}

export function HomeDashboard() {
  return (
    <div className="space-y-8 min-[821px]:space-y-10">
      <section className="relative grid min-h-[26rem] overflow-hidden rounded-[1.625rem] border border-primary/20 bg-gradient-to-br from-surface-raised via-surface-raised to-primary-subtle shadow-soft min-[1024px]:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.75fr)]">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(circle_at_82%_45%,black,transparent_58%)]" />
        <div className="relative z-10 flex flex-col justify-center px-5 pb-7 pt-8 min-[521px]:px-8 min-[821px]:px-10 min-[1024px]:py-10 min-[1440px]:pl-12">
          <div className="premium-kicker flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_5px_hsl(var(--accent)/.12)]" />PERSONAL INTELLIGENCE ONLINE</div>
          <Suspense fallback={<p className="mb-3 mt-5 text-sm font-bold text-muted-foreground">欢迎回来。</p>}><HomeWelcome /></Suspense>
          <h1 className="max-w-[46rem] text-balance text-[clamp(2.25rem,4.15vw,4.35rem)] font-[780] leading-[.98] tracking-[-.066em]"><span className="block">让你的 AI，</span><span className="block bg-gradient-to-r from-primary via-[#6f8fff] to-secondary bg-clip-text text-transparent">真正成为一个工作室。</span></h1>
          <p className="mt-5 max-w-[40rem] text-body text-muted-foreground">把连续对话、专属人格、长期记忆和创作工具连接成统一工作流。界面保持安静，能力在需要时出现。</p>
          <div className="mt-6 flex flex-col gap-2.5 min-[521px]:flex-row"><Button asChild size="lg"><Link href="/chat">开始新对话<ArrowUpRight className="size-4" /></Link></Button><Button asChild size="lg" variant="outline"><Link href="/tools/brainstorm"><BrainCircuit className="size-4" />启动多 Agent</Link></Button></div>
        </div>
        <LumenCoreVisual />
      </section>

      <Suspense fallback={<OverviewFallback />}><HomeOverview /></Suspense>

      <section aria-labelledby="studio-title"><SectionHeader description="每项能力保持独立，但在需要时自然协同。" id="studio-title" kicker="YOUR STUDIO" title="完整工作空间" /><div className="mt-5 grid items-stretch gap-3 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">{capabilities.map((item) => <Link className="group relative flex min-h-[12.5rem] flex-col rounded-card border border-border/12 bg-surface/70 p-5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-surface-raised hover:shadow-soft" href={item.href} key={item.number}><span className="absolute right-5 top-5 text-[.625rem] font-extrabold tracking-[.12em] text-muted-foreground">{item.number}</span><span className="premium-icon-tile size-10"><item.icon className="size-[1.1rem]" /></span><h3 className="mt-5 text-card-title">{item.title}</h3><p className="mt-2 flex-1 text-supporting">{item.description}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary">{item.action}<ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>)}</div></section>

      <section className="flex flex-col gap-4 rounded-control border border-border/12 bg-surface-muted/65 p-4 min-[521px]:flex-row min-[521px]:items-center min-[521px]:p-5"><span className="premium-icon-tile size-11 shrink-0"><ShieldCheck className="size-5" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">你的内容按用途彼此隔离</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">对话、人格、长期记忆和工具记录各自遵循清晰边界，并由服务端身份与所有权校验保护。</p></div><Button asChild size="sm" variant="ghost"><Link href="/account">查看设置<ArrowUpRight className="size-3.5" /></Link></Button></section>
    </div>
  );
}
