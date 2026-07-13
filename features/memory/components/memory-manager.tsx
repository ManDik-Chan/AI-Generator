"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Brain, Database, Pencil, Pin, PinOff, Plus, Search, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBanner } from "@/components/ui/status-banner";
import { deleteMemoryAction, setMemoryEnabledAction, setMemoryMasterEnabledAction, setMemoryPinnedAction } from "@/features/memory/actions";
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from "@/features/memory/constants";
import { MemoryFormDialog } from "@/features/memory/components/memory-form-dialog";
import type { MemoryView } from "@/features/memory/types";

interface MemoryManagerProps {
  memories: MemoryView[];
  personas: Array<{ id: string; name: string }>;
  memoryEnabled: boolean;
  initialPersonaId?: string;
  maxTotal: number;
  referenceNow: string;
  semanticIndex: { configured: boolean; indexed: number; pending: number; indexedIds: string[]; model: string; dimensions: number };
}

export function MemoryManager({ memories, personas, memoryEnabled, initialPersonaId, maxTotal, referenceNow, semanticIndex }: MemoryManagerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryView>();
  const [deleting, setDeleting] = useState<MemoryView>();
  const [filter, setFilter] = useState(initialPersonaId ? `persona:${initialPersonaId}` : "all");
  const [sort, setSort] = useState("updated");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const indexedIds = useMemo(() => new Set(semanticIndex.indexedIds), [semanticIndex.indexedIds]);
  const enabledCount = memories.filter((memory) => memory.enabled).length;
  const pinnedCount = memories.filter((memory) => memory.pinned).length;
  const capacityPercent = maxTotal ? Math.min(100, Math.round((memories.length / maxTotal) * 100)) : 0;
  const duplicateTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const memory of memories) if (memory.topicKey) {
      const key = `${memory.scope}:${memory.personaId ?? "global"}:${memory.topicKey}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [memories]);

  const shown = useMemo(() => {
    const cutoff = new Date(referenceNow).getTime() - 90 * 86_400_000;
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return memories.filter((memory) => {
      const matchesQuery = !normalizedQuery || [memory.content, memory.topicKey, ...memory.keywords].filter(Boolean).some((value) => value!.toLocaleLowerCase("zh-CN").includes(normalizedQuery));
      const matchesFilter = filter === "all"
        || (filter === "global" && memory.scope === "GLOBAL")
        || (filter === "persona" && memory.scope === "PERSONA")
        || (filter === "enabled" && memory.enabled)
        || (filter === "disabled" && !memory.enabled)
        || (filter === "pinned" && memory.pinned)
        || (filter === "never" && memory.useCount === 0)
        || (filter === "stale" && new Date(memory.lastUsedAt ?? memory.createdAt).getTime() < cutoff)
        || (filter === "duplicates" && Boolean(memory.topicKey) && (duplicateTopics.get(`${memory.scope}:${memory.personaId ?? "global"}:${memory.topicKey}`) ?? 0) > 1)
        || filter === `category:${memory.category}`
        || filter === `persona:${memory.personaId}`;
      return matchesQuery && matchesFilter;
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === "used" ? b.useCount - a.useCount || a.id.localeCompare(b.id) : sort === "importance" ? b.importance - a.importance || a.id.localeCompare(b.id) : sort === "lastUsed" ? new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime() || a.id.localeCompare(b.id) : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || a.id.localeCompare(b.id)));
  }, [memories, filter, sort, query, duplicateTopics, referenceNow]);

  const filterControls = <>
    <label className="relative min-w-0 md:col-span-2 lg:col-span-1"><span className="sr-only">搜索记忆</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input className="premium-field h-11 pl-10 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="搜索记忆内容或关键词" type="search" value={query} /></label>
    <select aria-label="筛选记忆" className="premium-field h-11 min-w-0 px-3 text-sm" onChange={(event) => setFilter(event.target.value)} value={filter}>
      <option value="all">全部记忆</option><option value="global">全局记忆</option><option value="persona">Persona 专属</option><option value="enabled">已启用</option><option value="disabled">已停用</option><option value="pinned">已置顶</option><option value="never">从未使用</option><option value="stale">长期未使用</option><option value="duplicates">同主题可能重复</option>
      {MEMORY_CATEGORIES.map((category) => <option key={category} value={`category:${category}`}>{MEMORY_CATEGORY_LABELS[category]}</option>)}
      {personas.map((persona) => <option key={persona.id} value={`persona:${persona.id}`}>{persona.name}</option>)}
    </select>
    <select aria-label="排序记忆" className="premium-field h-11 min-w-0 px-3 text-sm" onChange={(event) => setSort(event.target.value)} value={sort}><option value="updated">最近更新</option><option value="used">最常使用</option><option value="importance">重要程度</option><option value="lastUsed">最近使用</option></select>
  </>;

  return <div className="space-y-6">
    {message && <StatusBanner title="记忆库已更新" variant="success">{message}</StatusBanner>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="记忆状态概览">
      <div className="premium-panel p-4"><p className="premium-kicker">CAPACITY</p><div className="mt-3 flex items-end justify-between"><p className="text-2xl font-semibold tabular-nums">{memories.length}<span className="text-sm font-medium text-muted-foreground"> / {maxTotal}</span></p><span className="text-xs text-muted-foreground">{capacityPercent}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className={capacityPercent >= 100 ? "h-full bg-destructive" : capacityPercent >= 80 ? "h-full bg-warning" : "h-full bg-primary"} style={{ width: `${capacityPercent}%` }} /></div></div>
      <div className="premium-panel p-4"><p className="premium-kicker">ACTIVE</p><p className="mt-3 text-2xl font-semibold tabular-nums">{enabledCount}</p><p className="mt-1 text-xs text-muted-foreground">已启用记忆</p></div>
      <div className="premium-panel p-4"><p className="premium-kicker">PINNED</p><p className="mt-3 text-2xl font-semibold tabular-nums">{pinnedCount}</p><p className="mt-1 text-xs text-muted-foreground">置顶记忆</p></div>
      <div className="premium-panel p-4"><p className="premium-kicker">SEMANTIC INDEX</p><p className="mt-3 flex items-center gap-2 text-sm font-semibold"><Database className="size-4 text-primary" />{semanticIndex.configured ? `${semanticIndex.indexed} 已索引` : "关键词召回"}</p><p className="mt-1 text-xs text-muted-foreground">{semanticIndex.configured ? `${semanticIndex.pending} 条待同步 · ${semanticIndex.dimensions} 维` : "Embedding 未配置，安全降级"}</p></div>
    </section>

    {memories.length >= maxTotal ? <StatusBanner title="记忆容量已满" variant="error">自动记忆只能更新已有内容；删除不再需要的记忆后才能新增。</StatusBanner> : memories.length >= maxTotal * .8 ? <StatusBanner title="记忆容量接近上限" variant="warning">已使用 {memories.length} / {maxTotal} 条，建议检查长期未使用或重复主题。</StatusBanner> : null}

    <section className="premium-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-start gap-3"><span className="premium-icon-tile size-10 shrink-0"><Brain className="size-5" /></span><div><p className="font-semibold">允许 AI 使用和更新记忆</p><p className="mt-1 text-xs leading-5 text-muted-foreground">关闭后保留现有内容，但聊天不会召回或自动整理记忆。</p></div></div>
      <Button aria-pressed={memoryEnabled} className="shrink-0" disabled={pending} onClick={() => startTransition(async () => { const result = await setMemoryMasterEnabledAction(!memoryEnabled); setMessage(result.message); })} variant={memoryEnabled ? "default" : "outline"}>{memoryEnabled ? "记忆已开启" : "记忆已关闭"}</Button>
    </section>

    <section className="premium-panel p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 md:hidden"><div><p className="text-sm font-semibold">筛选与排序</p><p className="text-xs text-muted-foreground">当前显示 {shown.length} 条</p></div><Button aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} size="sm" variant="outline"><SlidersHorizontal className="size-4" />{filtersOpen ? "收起" : "展开"}</Button></div>
      <div className={`${filtersOpen ? "grid" : "hidden"} mt-3 gap-3 md:mt-0 md:grid md:grid-cols-4`}>{filterControls}</div>
      <div className="mt-3 flex items-center justify-between border-t border-border/10 pt-3"><p className="text-xs text-muted-foreground">显示 {shown.length} / {memories.length} 条真实记忆</p><Button onClick={() => { setEditing(undefined); setFormOpen(true); }} size="sm" variant="ghost"><Plus className="size-4" />手动添加</Button></div>
    </section>

    {shown.length ? <div className="grid gap-4 xl:grid-cols-2">{shown.map((memory) => {
      const duplicate = Boolean(memory.topicKey) && (duplicateTopics.get(`${memory.scope}:${memory.personaId ?? "global"}:${memory.topicKey}`) ?? 0) > 1;
      return <article className={`premium-panel group p-5 transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-0.5 hover:shadow-soft ${memory.enabled ? "" : "opacity-70"}`} key={memory.id}>
        <div className="flex items-start gap-3"><span className="premium-icon-tile size-10 shrink-0"><Brain className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="premium-kicker">{MEMORY_CATEGORY_LABELS[memory.category as keyof typeof MEMORY_CATEGORY_LABELS] ?? "其他"}</span>{memory.pinned && <span className="premium-chip border-primary/15 bg-primary-subtle text-primary-subtle-foreground"><Pin className="size-3" />已置顶</span>}{!memory.enabled && <span className="premium-chip">已停用</span>}</div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{memory.content}</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><span className="premium-chip">{memory.scope === "GLOBAL" ? "全局" : memory.personaName || "Persona"}</span><span className="premium-chip">重要程度 {memory.importance}</span><span className="premium-chip">使用 {memory.useCount} 次</span><span className={indexedIds.has(memory.id) ? "premium-chip border-primary/12 bg-primary-subtle text-primary-subtle-foreground" : "premium-chip"}><Sparkles className="size-3" />{semanticIndex.configured ? indexedIds.has(memory.id) ? "语义索引正常" : memory.enabled ? "等待索引" : "停用未索引" : "关键词召回"}</span>{duplicate && <span className="premium-chip border-warning/20 bg-warning-subtle text-warning-foreground">同主题可能重复</span>}</div>
        <div className="mt-4 grid gap-1 border-t border-border/10 pt-3 text-[.6875rem] text-muted-foreground sm:grid-cols-2"><p>最近使用：{memory.lastUsedAt ? memory.lastUsedAt.slice(0, 10) : "尚未使用"}</p><p>更新于：{memory.updatedAt.slice(0, 10)}</p><p>{memory.origin === "MANUAL" ? "手动添加" : "从对话中整理"}</p></div>
        {memory.sourceConversationId ? <Link className="mt-3 inline-flex min-h-9 items-center text-xs font-medium text-primary hover:underline" href={`/chat/${memory.sourceConversationId}`}>查看来源对话</Link> : memory.origin !== "MANUAL" ? <p className="mt-3 text-xs text-muted-foreground">来源对话已删除</p> : null}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border/10 pt-3"><Button disabled={pending} onClick={() => startTransition(async () => { const result = await setMemoryPinnedAction(memory.id, !memory.pinned); setMessage(result.message); })} size="sm" variant="ghost">{memory.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}{memory.pinned ? "取消置顶" : "置顶"}</Button><Button onClick={() => { setEditing(memory); setFormOpen(true); }} size="sm" variant="outline"><Pencil className="size-3.5" />编辑</Button><Button disabled={pending} onClick={() => startTransition(async () => { const result = await setMemoryEnabledAction(memory.id, !memory.enabled); setMessage(result.message); })} size="sm" variant="outline">{memory.enabled ? "停用" : "启用"}</Button><Button className="text-destructive-foreground" onClick={() => setDeleting(memory)} size="sm" variant="ghost"><Trash2 className="size-3.5" />删除</Button></div>
      </article>;
    })}</div> : <EmptyState description={memories.length ? "调整搜索、筛选或排序条件后再试。" : "在聊天中自然交流，值得长期保留的信息会安全地出现在这里。"} icon={<Brain className="size-6" />} title={memories.length ? "没有符合条件的记忆" : "AI 还没有记住长期信息"} />}

    <MemoryFormDialog initial={editing} onOpenChange={setFormOpen} onSaved={setMessage} open={formOpen} personas={personas} />
    {deleting && <div aria-labelledby="delete-memory-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-overlay/55 p-4 backdrop-blur-sm" role="dialog"><div className="premium-panel-strong w-full max-w-md p-5 sm:p-6"><h2 className="text-lg font-semibold" id="delete-memory-title">删除这条记忆？</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">只会删除长期记忆及对应语义向量，不会删除对话、消息或 Persona。</p><div className="mt-5 flex justify-end gap-2"><Button onClick={() => setDeleting(undefined)} variant="outline">取消</Button><Button className="bg-destructive text-white hover:bg-destructive/90" disabled={pending} onClick={() => startTransition(async () => { const result = await deleteMemoryAction(deleting.id); setMessage(result.message); setDeleting(undefined); })}>删除记忆</Button></div></div></div>}
  </div>;
}
