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
import { getHomePersonalization } from "@/features/home/data";
import { getTimeGreeting } from "@/features/home/presentation";

const capabilities = [
  { number: "01", title: "专属人格", description: "为不同任务建立独立角色、语气和边界。", action: "管理助手", href: "/personas", icon: Sparkles, tag: "人格", tint: "#B9CDB2" },
  { number: "02", title: "长期记忆", description: "查看、修正或关闭 AI 整理的重要偏好。", action: "管理记忆", href: "/memories", icon: Brain, tag: "记忆", tint: "#B8C6EA" },
  { number: "03", title: "文本工具", description: "总结、改写、翻译与结构化表达。", action: "打开工具", href: "/tools", icon: PenLine, tag: "文本", tint: "#E3DDD4" },
  { number: "04", title: "图片理解", description: "从截图、图表和照片中提取关键信息。", action: "分析图片", href: "/tools/image", icon: Image, tag: "图片", tint: "#F2C2AE" },
  { number: "05", title: "图片生成", description: "每次生成一张图片并保存到私有空间。", action: "开始创作", href: "/tools/image-generate", icon: ImagePlus, tag: "图片", tint: "#F2C2AE" },
  { number: "06", title: "多 Agent", description: "四个固定 Worker 分析，再由协调器综合。", action: "协作思考", href: "/tools/brainstorm", icon: BrainCircuit, tag: "Agent", tint: "#E9E778" },
  { number: "07", title: "运行历史", description: "查看真实工具状态、结果、恢复与下载。", action: "查看记录", href: "/tools/history", icon: History, tag: "系统", tint: "#E3DDD4" },
  { number: "08", title: "账户与隐私", description: "管理身份、主题和清晰的数据边界。", action: "打开设置", href: "/account", icon: UserRound, tag: "系统", tint: "#E3DDD4" },
] as const;

async function HomeWelcome() {
  const { displayName } = await getHomePersonalization();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Shanghai" }).format(new Date()));
  const greeting = getTimeGreeting(hour);
  return <>{displayName ? `${greeting}，${displayName}` : greeting}</>;
}

/** Small "label ↓" heading used above each block, as on the landing page. */
function BlockLabel({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="inline-flex items-center gap-1.5 text-[.8125rem] font-medium" id={id}>{children}<span aria-hidden="true" className="text-muted-foreground">↓</span></h2>
      {action}
    </div>
  );
}

function QuickTile({ children, href, icon: Icon }: { children: ReactNode; href: string; icon: typeof MessageSquareText }) {
  return (
    <Link className="group flex min-h-[10.5rem] flex-col rounded-card bg-surface p-4 transition-colors duration-500 ease-out-expo hover:bg-surface-muted" href={href} prefetch={false}>
      <span className="premium-icon-tile size-10 rounded-full"><Icon className="size-4" /></span>
      {children}
      <ArrowUpRight aria-hidden="true" className="ml-auto mt-auto size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function OverviewFallback() {
  return <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]"><div className="h-60 animate-pulse rounded-card bg-surface motion-reduce:animate-none" /><div className="h-60 animate-pulse rounded-card bg-surface motion-reduce:animate-none" /></div>;
}

async function HomeOverview() {
  const { recentConversations, metrics, isAdmin } = await getHomePersonalization();
  const metricItems = metrics ? [
    { label: "活跃对话", value: metrics.conversations },
    { label: "专属人格", value: metrics.personas },
    { label: "启用记忆", value: metrics.memories },
    { label: "图片作品", value: metrics.generatedImages },
  ] : [];

  return <>
    <div className="grid gap-x-0.5 gap-y-10 min-[1024px]:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
      <section aria-labelledby="quick-title">
        <BlockLabel action={<Link className="link-grow text-xs text-muted-foreground hover:text-foreground" href="/tools" prefetch={false}>全部工具</Link>} id="quick-title">快速启动</BlockLabel>
        <div className="grid gap-0.5 sm:grid-cols-3">
          <QuickTile href={recentConversations[0] ? `/chat/${recentConversations[0].id}` : "/chat"} icon={MessageSquareText}><p className="mt-5 text-card-title">{recentConversations[0] ? "继续上次对话" : "开始第一段对话"}</p><p className="mt-1 line-clamp-2 text-caption">{recentConversations[0]?.title ?? "选择默认助手或专属人格"}</p></QuickTile>
          <QuickTile href="/tools/image-generate" icon={ImagePlus}><p className="mt-5 text-card-title">生成视觉素材</p><p className="mt-1 text-caption">创建单张私有图片作品</p></QuickTile>
          <QuickTile href="/personas" icon={Sparkles}><p className="mt-5 text-card-title">切换专属人格</p><p className="mt-1 text-caption">用不同角色处理任务</p></QuickTile>
        </div>
      </section>
      <section aria-labelledby="recent-title" className="min-[1024px]:pl-6">
        <BlockLabel action={<Link className="link-grow text-xs text-muted-foreground hover:text-foreground" href="/chat" prefetch={false}>打开</Link>} id="recent-title">最近对话</BlockLabel>
        {recentConversations.length ? (
          <div className="border-t border-border/14">
            {recentConversations.map((conversation) => (
              <Link className="group grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border/14 py-3 transition-colors duration-300" href={`/chat/${conversation.id}`} key={conversation.id} prefetch={false}>
                <span className="min-w-0">
                  <span className="link-grow block w-fit max-w-full truncate text-sm font-medium">{conversation.title}</span>
                  <span className="mt-1 block truncate text-caption">{conversation.personaName ?? "默认助手"} · {conversation.updatedLabel}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:translate-x-1 group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-foreground/18 px-4 py-10 text-center"><p className="text-sm font-medium">还没有最近对话</p><p className="mt-1 text-caption">开始后会显示真实记录，不使用任何虚构数据。</p></div>
        )}
      </section>
    </div>

    {metricItems.length ? (
      <section aria-label="真实工作空间概览" className="mt-12 grid gap-0.5 sm:grid-cols-2 xl:grid-cols-4">
        {metricItems.map((metric) => (
          <div className="flex min-h-[8.5rem] flex-col justify-between rounded-card bg-surface p-4" key={metric.label}>
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="text-[clamp(2.5rem,4vw,3.5rem)] font-medium leading-none tracking-[-.04em] tabular-nums">{metric.value}</p>
          </div>
        ))}
      </section>
    ) : null}

    {isAdmin ? (
      <div className="mt-0.5 flex flex-col gap-3 rounded-card bg-surface p-4 sm:flex-row sm:items-center">
        <span className="premium-icon-tile size-10 rounded-full"><ShieldCheck className="size-4" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">管理员工作空间</p><p className="mt-1 text-caption">用户、用量、角色和系统状态入口仅对管理员可见。</p></div>
        <Button asChild size="sm" variant="outline"><Link href="/admin">系统管理</Link></Button>
      </div>
    ) : null}
  </>;
}

export function HomeDashboard() {
  return (
    <div className="pb-6">
      {/* Editorial header */}
      <section className="flex flex-col gap-8 pb-10 pt-2 min-[1024px]:flex-row min-[1024px]:items-end min-[1024px]:justify-between min-[1024px]:pb-14 min-[1024px]:pt-6">
        <div className="min-w-0 max-w-[48rem]">
          <p className="text-[.8125rem] font-medium">
            <Suspense fallback="欢迎回来"><HomeWelcome /></Suspense>
            <span aria-hidden="true" className="ml-1.5 text-muted-foreground">↓</span>
          </p>
          <h1 className="mt-4 text-balance text-[clamp(2.5rem,5.2vw,5rem)] font-medium leading-[1.02] tracking-[-.04em]">
            <span className="block">懂你所想，</span>
            <span className="block">守你所藏。</span>
          </h1>
          <p className="mt-5 max-w-[36rem] text-body text-muted-foreground">把连续对话、专属人格、长期记忆和创作工具连接成统一工作流。界面保持安静，能力在需要时出现。</p>
        </div>
        {/* WebKit reports cancelled post-login RSC speculation as a load error; these routes should load only after an explicit click. */}
        <div className="flex flex-col gap-2 min-[521px]:flex-row min-[1024px]:shrink-0">
          <Button asChild size="lg"><Link href="/chat" prefetch={false}>开始新对话<ArrowUpRight className="size-4" /></Link></Button>
          <Button asChild size="lg" variant="outline"><Link href="/tools/brainstorm" prefetch={false}><BrainCircuit className="size-4" />启动多 Agent</Link></Button>
        </div>
      </section>

      <div className="rule-draw mb-10" />

      <Suspense fallback={<OverviewFallback />}><HomeOverview /></Suspense>

      <CapabilityCatalogue />
      <PrivacyBand />
    </div>
  );
}

/** Product-catalogue style grid of every workspace capability (static, no user data). */
export function CapabilityCatalogue() {
  return (
      <section aria-labelledby="studio-title" className="mt-14">
        <BlockLabel id="studio-title">完整工作空间</BlockLabel>
        <div className="grid items-stretch gap-0.5 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {capabilities.map((item) => (
            <Link className="group relative flex min-h-[15rem] flex-col rounded-card bg-surface p-4 transition-colors duration-500 ease-out-expo hover:bg-surface-muted" href={item.href} key={item.number}>
              <span className="flex items-start justify-between gap-3">
                <span className="text-card-title">{item.title}</span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[.6875rem] font-medium text-[hsl(213_21%_10%)]" style={{ backgroundColor: item.tint }}>{item.tag}</span>
              </span>
              <span className="my-6 grid flex-1 place-items-center">
                <span className="premium-icon-tile size-16 rounded-full"><item.icon className="size-6" /></span>
              </span>
              <span className="flex items-end justify-between gap-3">
                <span className="min-w-0"><span className="block text-[.6875rem] tabular-nums text-muted-foreground">{item.number}</span><span className="mt-1 block text-caption">{item.description}</span></span>
                <span className="inline-flex shrink-0 translate-y-1 items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[.6875rem] font-medium text-background opacity-0 transition-[opacity,transform] duration-500 ease-out-expo group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">{item.action}<ArrowUpRight className="size-3" /></span>
              </span>
            </Link>
          ))}
        </div>
      </section>
  );
}

/** Deep green band with the data-boundary promise. */
export function PrivacyBand() {
  return (
      <section className="mt-14 flex flex-col gap-5 rounded-card bg-forest p-6 text-[hsl(42_31%_94%)] min-[521px]:flex-row min-[521px]:items-end min-[521px]:justify-between min-[821px]:p-8">
        <div className="min-w-0 max-w-[40rem]">
          <ShieldCheck aria-hidden="true" className="size-5 text-lime" />
          <h2 className="mt-4 text-[clamp(1.5rem,2.6vw,2.25rem)] font-medium leading-tight tracking-[-.03em] text-lime">你的内容按用途彼此隔离。</h2>
          <p className="mt-3 text-sm leading-6 text-[hsl(42_31%_94%/.75)]">对话、人格、长期记忆和工具记录各自遵循清晰边界，并由服务端身份与所有权校验保护。</p>
        </div>
        <Link className="group inline-flex shrink-0 items-center gap-2 text-sm text-[hsl(42_31%_94%)]" href="/account" prefetch={false}><span className="link-grow">查看设置</span><ArrowRight aria-hidden="true" className="size-4 transition-transform duration-500 ease-out-expo group-hover:translate-x-1" /></Link>
      </section>
  );
}
