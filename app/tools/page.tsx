import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BrainCircuit, FileImage, FileText, History, ImagePlus, Languages, WandSparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { TOOL_LABELS, TOOL_PATHS } from "@/features/tools/constants";
import { getRecentToolRuns } from "@/features/tools/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const textTools = [
  { type: "SUMMARIZE" as const, icon: FileText, number: "01", description: "将长文本整理为清晰摘要、要点或学习笔记。" },
  { type: "REWRITE" as const, icon: WandSparkles, number: "02", description: "优化表达、语气和结构，同时保持原意与事实。" },
  { type: "TRANSLATE" as const, icon: Languages, number: "03", description: "翻译文本并尽量保留格式、术语和语气。" },
];

/** Flat catalogue tile shared by every tool on this page (same language as the workspace dashboard). */
function ToolTile({ href, icon: Icon, number, title, description, action, tag, className, children }: {
  href: string; icon: LucideIcon; number: string; title: string; description: string; action: string; tag?: string; className?: string; children?: ReactNode;
}) {
  return (
    <Link className={`group relative flex h-full min-h-[14rem] min-w-0 flex-col rounded-card bg-surface p-5 transition-colors duration-500 ease-out-expo hover:bg-surface-muted ${className ?? ""}`} href={href}>
      <span className="flex items-start justify-between gap-3">
        <span className="premium-icon-tile size-11 rounded-full"><Icon className="size-5" /></span>
        {tag ? <span className="rounded-full border border-border/14 px-2 py-0.5 text-[.6875rem] text-muted-foreground">{tag}</span> : null}
      </span>
      <span className="mt-6 block text-[.6875rem] tabular-nums text-muted-foreground">{number}</span>
      <h2 className="mt-1 text-card-title">{title}</h2>
      <p className="mt-2 max-w-[34rem] text-sm leading-6 text-muted-foreground">{description}</p>
      {children}
      <span className="mt-auto inline-flex items-center gap-1 pt-5 text-xs font-medium text-foreground">
        <span className="link-grow">{action}</span>
        <ArrowUpRight aria-hidden="true" className="size-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export default async function ToolsPage() {
  const user = await requireUser();
  const recent = await getRecentToolRuns(user.id);
  return <AppShell>
    <PageHeader
      description="独立处理文本与图片；工具不会读取或写入长期记忆，也不会创建聊天记录。"
      eyebrow="AI 工具"
      primaryAction={<Button asChild variant="outline"><Link href="/tools/history"><History className="size-4" />工具历史</Link></Button>}
      title="实用 AI 工具"
    />

    <section className="mt-10">
      <SectionHeader description="总结、改写和翻译均使用同一套流式工作区。" kicker="文本工具" title="文本工作台" />
      <div className="mt-4 grid items-stretch gap-4 md:grid-cols-3">
        {textTools.map((tool) => (
          <ToolTile action="打开工具" description={tool.description} href={TOOL_PATHS[tool.type]} icon={tool.icon} key={tool.type} number={tool.number} title={TOOL_LABELS[tool.type]} />
        ))}
      </div>
    </section>

    <section className="mt-12">
      <SectionHeader description="四个固定角色独立并行分析，再由协调器综合共同观点、分歧、风险和下一步。" kicker="多 Agent" title="协作思考工作台" />
      <div className="mt-4">
        <ToolTile action="开始头脑风暴" description="四个独立 Worker 并行思考，再由协调器综合结论。不会读取聊天、人格或长期记忆。" href="/tools/brainstorm" icon={BrainCircuit} number="04" tag="4 Worker · 1 协调器" title="多 Agent 头脑风暴">
          <span aria-hidden="true" className="mt-5 flex flex-wrap gap-1.5">
            {["发散视角", "反方质疑", "落地路径", "类比迁移"].map((role) => <span className="rounded-full bg-background px-2.5 py-1 text-[.6875rem] text-muted-foreground" key={role}>{role}</span>)}
            <span className="rounded-full bg-lime px-2.5 py-1 text-[.6875rem] font-medium text-[hsl(213_21%_10%)]">协调器综合</span>
          </span>
        </ToolTile>
      </div>
    </section>

    <section className="mt-12">
      <SectionHeader description="图片分析理解现有图片；图片创作根据文字生成一张新图片。" kicker="图片工具" title="视觉工作台" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ToolTile action="分析已有图片" description="上传现有图片，描述场景、分析截图或回答相关问题。" href="/tools/image" icon={FileImage} number="05" tag="图片理解" title="图片分析" />
        <ToolTile action="开始图片创作" description="输入文字描述，由 AI 每次生成一张图片并保存到私有空间。" href="/tools/image-generate" icon={ImagePlus} number="06" tag="图片生成" title="AI 图片创作" />
      </div>
    </section>

    <section className="mt-12">
      <SectionHeader action={<Button asChild size="sm" variant="ghost"><Link href="/tools/history">查看全部<ArrowRight className="size-3.5" /></Link></Button>} kicker="运行记录" title="最近使用" />
      {recent.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{recent.map((run) => <Link className="min-w-0 rounded-card bg-surface p-4 transition-colors duration-500 ease-out-expo hover:bg-surface-muted" href="/tools/history" key={run.id}><p className="text-xs text-muted-foreground">{TOOL_LABELS[run.type]}</p><p className="mt-2 truncate text-sm font-medium">{run.title || TOOL_LABELS[run.type]}</p><p className="mt-2 text-xs tabular-nums text-muted-foreground">{run.createdAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p></Link>)}</div> : <EmptyState className="mt-4" description="关闭历史保存的运行不会出现在这里。" icon={<History className="size-6" />} title="尚无最近记录" />}
    </section>
  </AppShell>;
}
