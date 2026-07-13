"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TOOL_LABELS, TOOL_PATHS } from "@/features/tools/constants";
import type { ToolRunDetail, ToolRunListItem, ToolTypeValue } from "@/features/tools/types";

export function ToolHistory({ items, page, pages, filter }: { items: ToolRunListItem[]; page: number; pages: number; filter: "ALL" | ToolTypeValue }) {
  const router = useRouter();
  const [details, setDetails] = useState<Record<string, ToolRunDetail>>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();

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
      sessionStorage.setItem(`ai-tool-draft:${detail.type}`, JSON.stringify({ input: detail.inputText, options: detail.options }));
      router.push(TOOL_PATHS[detail.type]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法读取这条工具记录。"); }
  }
  const pageHref = (nextPage: number) => `/tools/history?page=${nextPage}${filter === "ALL" ? "" : `&type=${filter}`}`;
  const visible = items.filter((item) => !deleted.includes(item.id));

  return <div className="space-y-4">
    {message && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800">{message}</p>}
    <div className="flex flex-wrap gap-2">{(["ALL", "SUMMARIZE", "REWRITE", "TRANSLATE"] as const).map((type) => <Button asChild key={type} size="sm" variant={filter === type ? "default" : "outline"}><Link href={type === "ALL" ? "/tools/history" : `/tools/history?type=${type}`}>{type === "ALL" ? "全部" : TOOL_LABELS[type]}</Link></Button>)}</div>
    {visible.length ? <div className="grid gap-4">{visible.map((item) => <article className="min-w-0 rounded-2xl border bg-card p-4" key={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-primary">{TOOL_LABELS[item.type]} · {item.status === "COMPLETE" ? "已完成" : item.status === "CANCELLED" ? "已停止" : item.status === "ERROR" ? "失败" : "处理中"}</p><h2 className="mt-1 break-words font-semibold">{item.title || TOOL_LABELS[item.type]}</h2><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN")}</p></div><div className="flex flex-wrap gap-2"><Button onClick={() => void open(item.id)} size="sm" variant="outline"><ExternalLink className="size-3.5" />{details[item.id] ? "收起" : "打开"}</Button><Button onClick={() => void continueEditing(item.id)} size="sm" variant="ghost"><Pencil className="size-3.5" />继续编辑</Button><Button className="text-red-600" onClick={() => void remove(item.id)} size="sm" variant="ghost"><Trash2 className="size-3.5" />删除</Button></div></div>
      <div className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-2"><p className="min-w-0 break-words rounded-xl bg-muted/60 p-3"><span className="mb-1 block text-xs text-muted-foreground">输入</span>{item.inputPreview || "无可恢复输入"}</p><p className="min-w-0 break-words rounded-xl bg-muted/60 p-3"><span className="mb-1 block text-xs text-muted-foreground">输出</span>{item.outputPreview || (item.status === "ERROR" ? "运行失败，没有完整输出。" : item.status === "CANCELLED" ? "运行已停止，没有保存完整输出。" : "暂无输出")}</p></div>
      {details[item.id] && <div className="mt-4 grid min-w-0 gap-3 border-t pt-4 lg:grid-cols-2"><pre className="min-w-0 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-4 text-sm">{details[item.id].inputText}</pre><div className="min-w-0"><pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-4 text-sm">{details[item.id].outputText || "没有保存完整输出。"}</pre>{details[item.id].outputText && <Button className="mt-2" onClick={() => void navigator.clipboard.writeText(details[item.id].outputText || "")} size="sm" variant="outline"><Copy className="size-3.5" />复制结果</Button>}</div></div>}
    </article>)}</div> : <div className="rounded-2xl border border-dashed p-10 text-center"><h2 className="font-semibold">还没有工具历史</h2><p className="mt-2 text-sm text-muted-foreground">运行工具并开启“保存到工具历史”后，记录会显示在这里。</p></div>}
    <div className="flex items-center justify-between"><Button asChild className={page <= 1 ? "pointer-events-none opacity-50" : ""} variant="outline"><Link href={pageHref(page - 1)}>上一页</Link></Button><span className="text-sm text-muted-foreground">第 {page} / {pages} 页</span><Button asChild className={page >= pages ? "pointer-events-none opacity-50" : ""} variant="outline"><Link href={pageHref(page + 1)}>下一页</Link></Button></div>
  </div>;
}
