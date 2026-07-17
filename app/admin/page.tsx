import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  Database,
  HardDrive,
  History,
  Image as ImageIcon,
  MessageSquareText,
  Settings2,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { RoleControl } from "@/features/admin/components/role-control";
import { getAdminOverview } from "@/features/admin/data";
import { TOOL_LABELS } from "@/features/tools/constants";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const toolTypes = ["SUMMARIZE", "REWRITE", "TRANSLATE", "IMAGE_ANALYZE", "IMAGE_GENERATE", "BRAINSTORM"] as const;
const statusLabel = (status: string) => status === "COMPLETE" ? "已完成" : status === "CANCELLED" ? "已停止" : status === "ERROR" ? "失败" : "处理中";
const statusClass = (status: string) => status === "COMPLETE" ? "border-success/15 bg-success-subtle text-success-foreground" : status === "CANCELLED" ? "border-warning/15 bg-warning-subtle text-warning-foreground" : status === "ERROR" ? "border-destructive/15 bg-destructive-subtle text-destructive-foreground" : "border-primary/15 bg-primary-subtle text-primary-subtle-foreground";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export default async function AdminPage() {
  const [{ user, profile }, overview] = await Promise.all([requireAdmin(), getAdminOverview()]);
  const viewer: ShellViewer = {
    avatarUrl: profile.avatarUrl ?? undefined,
    displayName: profile.displayName ?? undefined,
    email: profile.email ?? user.email ?? undefined,
    role: profile.role,
  };
  const pendingRuns = (overview.toolRuns.byStatus.PENDING ?? 0) + (overview.generationRuns.PENDING ?? 0);
  const metrics = [
    { label: "用户", value: overview.users.total, detail: `${overview.users.admins} 名管理员`, icon: Users },
    { label: "对话", value: overview.totals.conversations, detail: `${overview.totals.messages} 条消息`, icon: MessageSquareText },
    { label: "工具运行", value: overview.totals.toolRuns, detail: `${pendingRuns} 项处理中`, icon: Wrench },
    { label: "私有图片", value: overview.totals.images, detail: formatBytes(overview.storageBytes), icon: ImageIcon },
  ];
  const systems = [
    { label: "数据库", detail: "实时查询已成功", ready: overview.system.database, icon: Database },
    { label: "对话与文本 AI", detail: "服务端 Provider 配置", ready: overview.system.ai, icon: Bot },
    { label: "图片理解", detail: "图片 Provider 与私有存储", ready: overview.system.imageAnalysis, icon: ImageIcon },
    { label: "图片生成", detail: "生成 Provider 与目标 Bucket", ready: overview.system.imageGeneration, icon: HardDrive },
    { label: "多 Agent", detail: "四 Worker 与协调器配置", ready: overview.system.brainstorm, icon: BrainCircuit },
  ];

  return <AppShell mobileTitle="系统管理" variant="wide" viewer={viewer}>
    <PageHeader
      description="全部数据来自当前数据库和服务端配置检查；不展示 Prompt、完整模型输出、密钥或存储路径。"
      eyebrow="ADMINISTRATION"
      primaryAction={<Button asChild variant="outline"><Link href="/tools/history"><History className="size-4" />运行历史</Link></Button>}
      title="系统管理"
    />

    <section aria-label="系统概览" className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <article className="premium-panel flex items-center gap-4 p-4 sm:p-5" key={metric.label}><span className="premium-icon-tile size-11 shrink-0"><metric.icon className="size-5" /></span><div><p className="text-2xl font-semibold tabular-nums">{metric.value}</p><p className="mt-1 text-sm font-semibold">{metric.label}</p><p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p></div></article>)}
    </section>

    <section className="mt-9" aria-labelledby="system-status-title">
      <SectionHeader description={`${overview.system.modelConfigCount} 条模型配置 · ${overview.system.appSettingCount} 条应用设置；这里只报告是否就绪，不回显环境值。`} id="system-status-title" kicker="LIVE CONFIGURATION" title="系统状态" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{systems.map((system) => <article className="premium-panel p-4" key={system.label}><div className="flex items-start justify-between gap-3"><span className="premium-icon-tile size-10"><system.icon className="size-4" /></span>{system.ready ? <CheckCircle2 aria-label="已就绪" className="size-4 text-success" /> : <CircleAlert aria-label="未配置" className="size-4 text-warning" />}</div><h3 className="mt-4 text-sm font-semibold">{system.label}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{system.detail}</p><span className={`premium-chip mt-3 ${system.ready ? "border-success/15 bg-success-subtle text-success-foreground" : "border-warning/15 bg-warning-subtle text-warning-foreground"}`}>{system.ready ? "已就绪" : "未配置"}</span></article>)}</div>
    </section>

    <div className="mt-9 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.55fr)]">
      <section className="premium-panel p-4 sm:p-5" aria-labelledby="usage-title">
        <SectionHeader description="按真实 ToolRun 统计，不推算 Token、置信度或网络来源。" id="usage-title" kicker="REAL USAGE" title="运行与用量" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{toolTypes.map((type) => <div className="premium-subpanel p-4" key={type}><p className="premium-kicker">{type}</p><p className="mt-2 text-sm font-semibold">{TOOL_LABELS[type]}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{overview.toolRuns.byType[type] ?? 0}</p></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["PENDING", "COMPLETE", "ERROR", "CANCELLED"] as const).map((status) => <span className={`premium-chip ${statusClass(status)}`} key={status}>{statusLabel(status)} {overview.toolRuns.byStatus[status] ?? 0}</span>)}
          <span className="premium-chip">记忆 {overview.totals.memories}</span>
          <span className="premium-chip">Worker 完成 {overview.brainstormWorkers.COMPLETE ?? 0}</span>
          <span className="premium-chip">Worker 失败 {overview.brainstormWorkers.ERROR ?? 0}</span>
        </div>
      </section>

      <section className="premium-panel p-4 sm:p-5" aria-labelledby="operations-title">
        <SectionHeader description="所有入口仍执行各自的所有权与权限校验。" id="operations-title" kicker="OPERATIONS" title="操作入口" />
        <div className="mt-5 grid gap-2">
          {[
            { href: "/tools/history", label: "检查运行历史", icon: Activity },
            { href: "/tools/brainstorm", label: "检查多 Agent 工作台", icon: BrainCircuit },
            { href: "/account", label: "查看当前账户边界", icon: ShieldCheck },
          ].map((item) => <Link className="flex min-h-12 items-center gap-3 rounded-control border border-border/10 bg-surface-muted/55 px-3.5 text-sm font-semibold transition hover:border-primary/22 hover:bg-surface-raised" href={item.href} key={item.href}><item.icon className="size-4 text-primary" /><span className="flex-1">{item.label}</span><ArrowUpRight className="size-3.5 text-muted-foreground" /></Link>)}
        </div>
      </section>
    </div>

    <section className="mt-9" aria-labelledby="users-title">
      <SectionHeader description={`显示最近 ${Math.min(overview.users.total, overview.users.limit)} / ${overview.users.total} 名用户；角色更新使用服务端管理员校验，且不能自降权或移除最后一名管理员。`} id="users-title" kicker="ACCESS CONTROL" title="用户与角色" />
      <div className="mt-4 grid gap-3">{overview.users.items.map((item) => <article className="premium-panel grid min-w-0 gap-4 p-4 lg:grid-cols-[minmax(15rem,1fr)_minmax(16rem,.8fr)_auto] lg:items-center" key={item.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all text-sm font-semibold">{item.displayName || item.email}</p><span className="premium-chip">{item.role === "ADMIN" ? "管理员" : "普通用户"}</span></div><p className="mt-1 break-all text-xs text-muted-foreground">{item.email}</p><p className="mt-1 text-xs text-muted-foreground">加入于 {item.createdAt.toLocaleDateString("zh-CN")}</p></div><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span className="premium-subpanel p-2.5">对话 <strong className="block pt-1 text-sm">{item._count.conversations}</strong></span><span className="premium-subpanel p-2.5">人格 <strong className="block pt-1 text-sm">{item._count.personas}</strong></span><span className="premium-subpanel p-2.5">记忆 <strong className="block pt-1 text-sm">{item._count.memories}</strong></span><span className="premium-subpanel p-2.5">运行 <strong className="block pt-1 text-sm">{item._count.toolRuns}</strong></span></div><RoleControl disabled={item.id === user.id} profileId={item.id} role={item.role} /></article>)}</div>
    </section>

    <section className="mt-9" aria-labelledby="recent-operations-title">
      <SectionHeader description="仅显示运行元数据，不加载输入正文或输出正文。" id="recent-operations-title" kicker="RECENT OPERATIONS" title="最近运行" />
      <div className="mt-4 grid gap-3">{overview.toolRuns.recent.length ? overview.toolRuns.recent.map((run) => <article className="premium-panel flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center" key={run.id}><span className="premium-icon-tile size-10 shrink-0"><Settings2 className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="premium-kicker">{TOOL_LABELS[run.type]}</p><span className={`premium-chip ${statusClass(run.status)}`}>{statusLabel(run.status)}</span>{run.errorCode ? <span className="premium-chip">{run.errorCode}</span> : null}</div><p className="mt-1 truncate text-sm font-semibold">{run.title || TOOL_LABELS[run.type]}</p><p className="mt-1 break-all text-xs text-muted-foreground">{run.user.displayName || run.user.email} · {run.createdAt.toLocaleString("zh-CN")}</p></div><Button asChild size="sm" variant="ghost"><Link href={`/tools/history?type=${run.type}`}>查看同类<ArrowUpRight className="size-3.5" /></Link></Button></article>) : <div className="premium-panel p-8 text-center text-sm text-muted-foreground">暂无真实运行记录。</div>}</div>
    </section>
  </AppShell>;
}
