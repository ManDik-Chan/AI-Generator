import Link from "next/link";
import { ArrowRight, FileText, History, Languages, WandSparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { TOOL_LABELS, TOOL_PATHS } from "@/features/tools/constants";
import { getRecentToolRuns } from "@/features/tools/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const tools = [
  { type: "SUMMARIZE" as const, icon: FileText, description: "将长文本整理为清晰摘要、要点或详细笔记。" },
  { type: "REWRITE" as const, icon: WandSparkles, description: "优化表达、语气和结构，同时保持原意与事实。" },
  { type: "TRANSLATE" as const, icon: Languages, description: "翻译文本并尽量保留格式、术语和语气。" },
];

export default async function ToolsPage() {
  const user = await requireUser();
  const recent = await getRecentToolRuns(user.id);
  return <AppShell><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-primary">AI 工具箱</p><h1 className="mt-1 text-3xl font-semibold">实用文本工具</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">选择一个工具处理文本。工具不会读取或写入长期记忆，也不会创建聊天记录。</p></div><Button asChild variant="outline"><Link href="/tools/history"><History className="size-4" />工具历史</Link></Button></div><div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tools.map((tool) => <Link className="group min-w-0 rounded-2xl border bg-card p-5 transition hover:-translate-y-1 hover:border-primary/35 hover:shadow-soft" href={TOOL_PATHS[tool.type]} key={tool.type}><span className="grid size-11 place-items-center rounded-xl bg-muted text-primary"><tool.icon className="size-5" /></span><h2 className="mt-5 font-semibold">{TOOL_LABELS[tool.type]}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{tool.description}</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-primary">打开工具<ArrowRight className="size-3 transition group-hover:translate-x-1" /></span></Link>)}</div><section className="mt-9"><h2 className="text-xl font-semibold">最近使用</h2>{recent.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recent.map((run) => <Link className="min-w-0 rounded-xl border bg-card p-4 hover:bg-muted/50" href={`/tools/history`} key={run.id}><p className="text-xs font-medium text-primary">{TOOL_LABELS[run.type]}</p><p className="mt-1 truncate text-sm font-medium">{run.title || TOOL_LABELS[run.type]}</p><p className="mt-1 text-xs text-muted-foreground">{run.createdAt.toLocaleString("zh-CN")}</p></Link>)}</div> : <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">尚无最近记录。关闭历史保存的运行不会出现在这里。</p>}</section></AppShell>;
}
