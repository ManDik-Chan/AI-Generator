"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrainCircuit, Copy, Download, ExternalLink, FileImage, FileText, ImageOff, ImagePlus, Languages, Pencil, Trash2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TOOL_LABELS, TOOL_PATHS } from "@/features/tools/constants";
import type { ToolRunDetail, ToolRunListItem, ToolTypeValue } from "@/features/tools/types";

const icons = { SUMMARIZE: FileText, REWRITE: WandSparkles, TRANSLATE: Languages, IMAGE_ANALYZE: FileImage, IMAGE_GENERATE: ImagePlus, BRAINSTORM: BrainCircuit } as const;
const statusLabel = (status: string) => status === "COMPLETE" ? "已完成" : status === "CANCELLED" ? "已停止" : status === "ERROR" ? "失败" : "处理中";
const statusClass = (status: string) => status === "COMPLETE" ? "border-success/15 bg-success-subtle text-success-foreground" : status === "CANCELLED" ? "border-warning/15 bg-warning-subtle text-warning-foreground" : status === "ERROR" ? "border-destructive/15 bg-destructive-subtle text-destructive-foreground" : "border-primary/15 bg-primary-subtle text-primary-subtle-foreground";

export function ToolHistory({ items, page, pages, filter }: { items: ToolRunListItem[]; page: number; pages: number; filter: "ALL" | ToolTypeValue }) {
  const router = useRouter();
  const [details, setDetails] = useState<Record<string, ToolRunDetail>>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [statusFilter, setStatusFilter] = useState("ALL");

  async function load(runId: string) {
    if (details[runId]) return details[runId];
    const response = await fetch(`/api/tools/runs/${runId}`);
    if (!response.ok) throw new Error("无法读取这条工具记录。");
    const detail = await response.json() as ToolRunDetail;
    setDetails((current) => ({ ...current, [runId]: detail }));
    return detail;
  }
  async function open(runId: string) {
    if (details[runId]) { setDetails((current) => { const copy = { ...current }; delete copy[runId]; return copy; }); return; }
    try { await load(runId); } catch (error) { setMessage(error instanceof Error ? error.message : "无法读取这条工具记录。"); }
  }
  async function remove(runId: string) {
    if (!window.confirm("确定删除这条工具记录吗？此操作不会影响聊天、记忆或人格。")) return;
    const response = await fetch(`/api/tools/runs/${runId}`, { method: "DELETE" });
    if (!response.ok) { setMessage("删除失败，请稍后重试。"); return; }
    setDeleted((current) => [...current, runId]);
  }
  async function continueEditing(runId: string) {
    try {
      const detail = await load(runId);
      sessionStorage.setItem(`ai-tool-draft:${detail.type}`, JSON.stringify({ input: detail.type === "IMAGE_ANALYZE" && detail.inputText === "图片分析" ? "" : detail.inputText, options: detail.options, assetId: detail.asset && !detail.asset.expired ? detail.asset.id : undefined }));
      router.push(TOOL_PATHS[detail.type]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法读取这条工具记录。"); }
  }
  function downloadResult(detail: ToolRunDetail, extension: "txt" | "md") { const url = URL.createObjectURL(new Blob([detail.outputText || ""], { type: "text/plain;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${TOOL_LABELS[detail.type]}-${new Date(detail.createdAt).toISOString().slice(0, 10)}.${extension}`; anchor.click(); URL.revokeObjectURL(url); }
  const pageHref = (nextPage: number) => `/tools/history?page=${nextPage}${filter === "ALL" ? "" : `&type=${filter}`}`;
  const visible = items.filter((item) => !deleted.includes(item.id) && (statusFilter === "ALL" || item.status === statusFilter));

  return <div className="space-y-5">
    {message && <p className="rounded-control bg-warning-subtle p-3 text-sm text-warning-foreground">{message}</p>}
    <section className="premium-panel p-3 sm:p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{(["ALL", "SUMMARIZE", "REWRITE", "TRANSLATE", "IMAGE_ANALYZE", "IMAGE_GENERATE", "BRAINSTORM"] as const).map((type) => <Button asChild key={type} size="sm" variant={filter === type ? "default" : "outline"}><Link href={type === "ALL" ? "/tools/history" : `/tools/history?type=${type}`}>{type === "ALL" ? "全部类型" : TOOL_LABELS[type]}</Link></Button>)}</div><label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="shrink-0">运行状态</span><select aria-label="筛选运行状态" className="premium-field h-10 min-w-0 px-3 text-sm" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="ALL">全部状态</option><option value="COMPLETE">已完成</option><option value="CANCELLED">已停止</option><option value="ERROR">失败</option><option value="PENDING">处理中</option></select></label></div></section>

    {visible.length ? <div className="grid gap-4">{visible.map((item) => {
      const Icon = icons[item.type];
      const detail = details[item.id];
      return <article className="premium-panel min-w-0 overflow-hidden p-4 sm:p-5" key={item.id}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start"><span className="premium-icon-tile size-11 shrink-0"><Icon className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="premium-kicker">{TOOL_LABELS[item.type]}</p><span className={`premium-chip ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></div><h2 className="mt-2 break-words text-base font-semibold tracking-[-.015em]">{item.title || TOOL_LABELS[item.type]}</h2><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN")}</p></div><div className="flex flex-wrap gap-1.5 sm:justify-end"><Button onClick={() => void open(item.id)} size="sm" variant="outline"><ExternalLink className="size-3.5" />{details[item.id] ? "收起" : "打开"}</Button><Button onClick={() => void continueEditing(item.id)} size="sm" variant="ghost"><Pencil className="size-3.5" />{item.type === "IMAGE_ANALYZE" ? "再次分析" : item.type === "IMAGE_GENERATE" ? "再次创作" : item.type === "BRAINSTORM" ? "再次头脑风暴" : "继续编辑"}</Button><Button aria-label={`删除 ${item.title || TOOL_LABELS[item.type]}`} className="text-destructive-foreground" onClick={() => void remove(item.id)} size="icon" variant="ghost"><Trash2 className="size-3.5" /></Button></div></div>
        <div className="mt-4 grid min-w-0 gap-3 border-t border-border/10 pt-4 text-sm sm:grid-cols-2"><div className="premium-subpanel min-w-0 break-words p-3"><span className="premium-kicker mb-2 block">INPUT</span>{item.type === "IMAGE_ANALYZE" && item.asset ? item.asset.expired ? <span className="grid min-h-28 place-items-center text-center text-muted-foreground"><span><ImageOff className="mx-auto size-5" /><span className="mt-2 block text-xs">原图片已到期清理</span></span></span> : <span className="relative mt-2 block aspect-video overflow-hidden rounded-control"><span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">图片暂时不可用</span><Image alt="历史图片缩略图" className="z-10 bg-surface-muted object-contain" fill onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} src={`/api/tools/assets/${item.asset.id}`} unoptimized /></span> : item.inputPreview || "无可恢复输入"}</div><div className="premium-subpanel min-w-0 break-words p-3"><span className="premium-kicker mb-2 block">OUTPUT</span>{item.type === "IMAGE_GENERATE" && item.generatedImage ? <span className="relative block aspect-square max-h-48 overflow-hidden rounded-control"><Image alt="AI 生成图片" className="object-contain" fill src={`/api/generated-images/${item.generatedImage.id}`} unoptimized /></span> : item.outputPreview || (item.status === "ERROR" ? "运行失败，没有完整输出。" : item.status === "CANCELLED" ? "运行已停止，没有保存完整输出。" : "暂无输出")}</div></div>
        {detail?.type === "BRAINSTORM" && detail.brainstormWorkers?.length ? <div className="mt-4 grid gap-3 border-t border-border/10 pt-4 lg:grid-cols-2">{detail.brainstormWorkers.map((worker) => <div className="premium-subpanel min-w-0 p-4" key={worker.role}><div className="flex items-center justify-between gap-2"><p className="premium-kicker">{worker.label}</p><span className={`premium-chip ${statusClass(worker.status)}`}>{statusLabel(worker.status)}</span></div><pre className="premium-scrollbar mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-6">{worker.output || "暂无输出"}</pre></div>)}</div> : null}
        {details[item.id] && <div className="mt-4 grid min-w-0 gap-3 border-t border-border/10 pt-4 lg:grid-cols-2"><div><p className="premium-kicker mb-2">FULL INPUT</p><pre className="premium-result premium-scrollbar min-w-0 overflow-x-auto whitespace-pre-wrap break-words p-4 text-sm leading-6">{details[item.id].inputText}</pre></div><div className="min-w-0"><p className="premium-kicker mb-2">FULL OUTPUT</p><pre className="premium-result premium-scrollbar overflow-x-auto whitespace-pre-wrap break-words p-4 text-sm leading-6">{details[item.id].outputText || "没有保存完整输出。"}</pre>{details[item.id].outputText && <div className="mt-2 flex flex-wrap gap-2"><Button onClick={() => void navigator.clipboard.writeText(details[item.id].outputText || "")} size="sm" variant="outline"><Copy className="size-3.5" />复制结果</Button><Button onClick={() => downloadResult(details[item.id], "txt")} size="sm" variant="ghost"><Download className="size-3.5" />TXT</Button><Button onClick={() => downloadResult(details[item.id], "md")} size="sm" variant="ghost"><Download className="size-3.5" />Markdown</Button></div>}</div></div>}
      </article>;
    })}</div> : <EmptyState description={items.length ? "当前筛选条件下没有工具记录。" : "运行工具并开启“保存到工具历史”后，记录会显示在这里。"} icon={<FileText className="size-6" />} title={items.length ? "没有符合条件的记录" : "还没有工具历史"} />}

    <div className="flex items-center justify-between gap-3"><Button asChild className={page <= 1 ? "pointer-events-none opacity-50" : ""} variant="outline"><Link href={pageHref(page - 1)}>上一页</Link></Button><span className="premium-chip">第 {page} / {pages} 页</span><Button asChild className={page >= pages ? "pointer-events-none opacity-50" : ""} variant="outline"><Link href={pageHref(page + 1)}>下一页</Link></Button></div>
  </div>;
}
