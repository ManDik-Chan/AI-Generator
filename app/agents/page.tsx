import Link from "next/link";
import { ArrowRight, BrainCircuit, MessageSquareText, Search } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { AgentModeView, AgentRunStatusView } from "@/features/agents/client-types";
import { agentModeLabels, agentRunStatusLabels, getAgentRunProgressLabel } from "@/features/agents/presentation";
import { getAgentRunList } from "@/features/agents/queries";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const modes = new Set<AgentModeView>(["STANDARD", "DEEP"]);
const statuses = new Set<AgentRunStatusView>(["PENDING", "COMPLETE", "ERROR", "CANCELLED"]);

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ mode?: string; status?: string; q?: string }> }) {
  const user = await requireUser();
  const search = await searchParams;
  const mode = modes.has(search.mode as AgentModeView) ? search.mode as AgentModeView : undefined;
  const status = statuses.has(search.status as AgentRunStatusView) ? search.status as AgentRunStatusView : undefined;
  const query = search.q?.trim().slice(0, 200);
  const runs = await getAgentRunList({ userId: user.id, mode, status, query });
  return <AppShell variant="wide">
    <PageHeader description="查看动态 Worker、真实 Provider 调用数、事件与最终回答。打开历史不会重新调用模型或重复扣除 Credits。" eyebrow="AGENT ACTIVITY" primaryAction={<Button asChild><Link href="/chat"><MessageSquareText className="size-4" />在 Chat 中启动 Agent</Link></Button>} title="Agent 运行" />

    <form className="premium-panel mt-7 grid gap-3 p-4 sm:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]" method="get">
      <label className="relative"><span className="sr-only">搜索问题</span><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><input className="min-h-11 w-full rounded-control border border-border/14 bg-background px-10 text-sm outline-none focus:border-primary/45" defaultValue={query} name="q" placeholder="搜索原始问题" /></label>
      <label><span className="sr-only">模式</span><select className="min-h-11 w-full rounded-control border border-border/14 bg-background px-3 text-sm" defaultValue={mode ?? ""} name="mode"><option value="">全部模式</option><option value="STANDARD">标准</option><option value="DEEP">深度</option></select></label>
      <label><span className="sr-only">状态</span><select className="min-h-11 w-full rounded-control border border-border/14 bg-background px-3 text-sm" defaultValue={status ?? ""} name="status"><option value="">全部状态</option><option value="PENDING">运行中</option><option value="COMPLETE">已完成</option><option value="ERROR">失败</option><option value="CANCELLED">已停止</option></select></label>
      <Button type="submit" variant="outline">筛选</Button>
    </form>

    {runs.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{runs.map((run) => <article className="premium-panel-strong flex min-w-0 flex-col p-5" key={run.id}>
      <div className="flex flex-wrap items-center gap-2"><span className="premium-chip">{agentModeLabels[run.mode]}</span><span className="premium-chip">{agentRunStatusLabels[run.status]}</span><span className="premium-chip">{getAgentRunProgressLabel(run)}</span></div>
      <h2 className="mt-4 line-clamp-3 break-words text-lg font-semibold leading-7">{run.userProblem}</h2>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><span className="premium-subpanel p-2.5"><strong className="block text-base">{run.plannedWorkerCount}</strong>Worker</span><span className="premium-subpanel p-2.5"><strong className="block text-base">{run.successfulWorkerCount}</strong>成功</span><span className="premium-subpanel p-2.5"><strong className="block text-base">{run.providerCallCount}</strong>调用</span></div>
      <p className="mt-4 text-xs text-muted-foreground">开始 {new Date(run.startedAt).toLocaleString("zh-CN")}{run.completedAt ? ` · 完成 ${new Date(run.completedAt).toLocaleString("zh-CN")}` : " · 正在后台运行"}</p>
      {run.errorCode ? <p className="mt-2 text-xs text-destructive-foreground">{run.errorCode}</p> : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-5"><Button asChild size="sm" variant="outline"><Link href={`/chat/${run.conversationId}`}><MessageSquareText className="size-3.5" />进入 Chat</Link></Button><Button asChild size="sm"><Link href={`/agents/${run.id}`} prefetch={false}>查看 Worker 与事件<ArrowRight className="size-3.5" /></Link></Button></div>
    </article>)}</div> : <EmptyState action={<Button asChild><Link href="/chat">开始第一次 Agent 对话</Link></Button>} className="mt-5" description="调整筛选条件，或在 Chat Composer 中选择 Agent 标准/深度。" icon={<BrainCircuit className="size-6" />} title="暂无匹配的 Agent 运行" />}
  </AppShell>;
}
