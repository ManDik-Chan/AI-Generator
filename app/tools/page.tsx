import Link from "next/link";
import { ArrowRight, FileImage, FileText, History, Languages, ShieldCheck, WandSparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { TOOL_LABELS, TOOL_PATHS } from "@/features/tools/constants";
import { getRecentToolRuns } from "@/features/tools/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const textTools = [
  { type: "SUMMARIZE" as const, icon: FileText, kicker: "DISTILL", description: "将长文本整理为清晰摘要、要点或学习笔记。" },
  { type: "REWRITE" as const, icon: WandSparkles, kicker: "REFINE", description: "优化表达、语气和结构，同时保持原意与事实。" },
  { type: "TRANSLATE" as const, icon: Languages, kicker: "TRANSLATE", description: "翻译文本并尽量保留格式、术语和语气。" },
];

export default async function ToolsPage() {
  const user = await requireUser();
  const recent = await getRecentToolRuns(user.id);
  return <AppShell>
    <PageHeader
      description="独立处理文本与图片；工具不会读取或写入长期记忆，也不会创建聊天记录。"
      eyebrow="AI WORKBENCH"
      primaryAction={<Button asChild variant="outline"><Link href="/tools/history"><History className="size-4" />工具历史</Link></Button>}
      title="实用 AI 工具"
    />

    <section className="mt-8">
      <SectionHeader description="总结、改写和翻译均使用同一套流式工作区。" kicker="TEXT TOOLS" title="文本工作台" />
      <div className="mt-4 grid gap-4 md:grid-cols-3">{textTools.map((tool, index) => <Link className={`${index === 0 ? "md:row-span-2 md:min-h-[22rem]" : "md:min-h-[10.5rem]"} group premium-panel relative flex min-w-0 flex-col overflow-hidden p-5 transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-1 hover:border-primary/28 hover:shadow-raised`} href={TOOL_PATHS[tool.type]} key={tool.type}><div className="absolute right-0 top-0 size-36 rounded-full bg-primary/8 blur-3xl" /><span className="premium-icon-tile relative size-11"><tool.icon className="size-5" /></span><p className="premium-kicker relative mt-5">{tool.kicker}</p><h2 className="relative mt-1 text-lg font-semibold tracking-[-.025em]">{TOOL_LABELS[tool.type]}</h2><p className="relative mt-2 text-sm leading-6 text-muted-foreground">{tool.description}</p><span className="relative mt-auto inline-flex items-center gap-1 pt-5 text-xs font-semibold text-primary">打开工具<ArrowRight className="size-3 transition-transform group-hover:translate-x-1" /></span></Link>)}</div>
    </section>

    <section className="mt-9">
      <SectionHeader description="私有上传、安全净化，仅在你点击分析后调用视觉模型。" kicker="VISION TOOL" title="图片理解" />
      <Link className="group premium-panel-strong relative mt-4 grid min-h-[17rem] overflow-hidden p-6 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center sm:p-8" href="/tools/image"><div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/12 to-transparent" /><div className="relative"><span className="premium-icon-tile size-12"><FileImage className="size-5" /></span><p className="premium-kicker mt-5">SECURE VISION</p><h2 className="mt-1 text-2xl font-semibold tracking-[-.035em]">图片分析</h2><p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">描述场景、分析截图、图表或界面，并针对图片回答问题。支持 JPEG、PNG 与 WebP 单图。</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">进入视觉工作台<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span></div><div className="surface-grid relative mt-6 grid aspect-[4/3] place-items-center rounded-card border border-primary/14 bg-primary-subtle/45 sm:mt-0"><div className="premium-orbit absolute size-36 rounded-full border border-primary/20" /><div className="premium-icon-tile size-20 rounded-[1.65rem] shadow-raised"><ShieldCheck className="size-8" /></div></div></Link>
    </section>

    <section className="mt-9">
      <SectionHeader action={<Button asChild size="sm" variant="ghost"><Link href="/tools/history">查看全部<ArrowRight className="size-3.5" /></Link></Button>} kicker="RECENT" title="最近使用" />
      {recent.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recent.map((run) => <Link className="premium-panel min-w-0 p-4 transition hover:border-primary/24 hover:bg-surface-raised" href="/tools/history" key={run.id}><p className="premium-kicker">{TOOL_LABELS[run.type]}</p><p className="mt-2 truncate text-sm font-semibold">{run.title || TOOL_LABELS[run.type]}</p><p className="mt-2 text-xs text-muted-foreground">{run.createdAt.toLocaleString("zh-CN")}</p></Link>)}</div> : <EmptyState className="mt-4" description="关闭历史保存的运行不会出现在这里。" icon={<History className="size-6" />} title="尚无最近记录" />}
    </section>
  </AppShell>;
}
