"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Brain, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteMemoryAction,
  setMemoryEnabledAction,
  setMemoryMasterEnabledAction,
  setMemoryPinnedAction,
} from "@/features/memory/actions";
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
} from "@/features/memory/constants";
import { MemoryFormDialog } from "@/features/memory/components/memory-form-dialog";
import type { MemoryView } from "@/features/memory/types";

interface MemoryManagerProps {
  memories: MemoryView[];
  personas: Array<{ id: string; name: string }>;
  memoryEnabled: boolean;
  initialPersonaId?: string;
  maxTotal: number;
  referenceNow: string;
}

export function MemoryManager({
  memories,
  personas,
  memoryEnabled,
  initialPersonaId,
  maxTotal,
  referenceNow,
}: MemoryManagerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryView>();
  const [deleting, setDeleting] = useState<MemoryView>();
  const [filter, setFilter] = useState(initialPersonaId ? `persona:${initialPersonaId}` : "all");
  const [sort, setSort] = useState("updated");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const duplicateTopics = useMemo(() => { const counts = new Map<string, number>(); for (const memory of memories) if (memory.topicKey) { const key = `${memory.scope}:${memory.personaId ?? "global"}:${memory.topicKey}`; counts.set(key, (counts.get(key) ?? 0) + 1); } return counts; }, [memories]);
  const shown = useMemo(
    () => {
      const cutoff = new Date(referenceNow).getTime() - 90 * 86_400_000;
      return memories.filter(
        (memory) =>
          filter === "all" ||
          (filter === "global" && memory.scope === "GLOBAL") ||
          (filter === "persona" && memory.scope === "PERSONA") ||
          (filter === "enabled" && memory.enabled) ||
          (filter === "disabled" && !memory.enabled) ||
          (filter === "pinned" && memory.pinned) ||
          (filter === "never" && memory.useCount === 0) ||
          (filter === "stale" && new Date(memory.lastUsedAt ?? memory.createdAt).getTime() < cutoff) ||
          (filter === "duplicates" && Boolean(memory.topicKey) && (duplicateTopics.get(`${memory.scope}:${memory.personaId ?? "global"}:${memory.topicKey}`) ?? 0) > 1) ||
          filter === `category:${memory.category}` ||
          filter === `persona:${memory.personaId}`,
      ).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === "used" ? b.useCount - a.useCount || a.id.localeCompare(b.id) : sort === "importance" ? b.importance - a.importance || a.id.localeCompare(b.id) : sort === "lastUsed" ? new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime() || a.id.localeCompare(b.id) : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || a.id.localeCompare(b.id)));
    },
    [memories, filter, sort, duplicateTopics, referenceNow],
  );

  return (
    <div className="space-y-5">
      {message && (
        <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</p>
      )}
      <div className={memories.length >= maxTotal ? "rounded-xl bg-red-500/10 p-3 text-sm text-red-700" : memories.length >= maxTotal * 0.8 ? "rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800" : "rounded-xl bg-muted p-3 text-sm text-muted-foreground"}>已使用 {memories.length} / {maxTotal} 条记忆{memories.length >= maxTotal ? "，自动记忆只能更新已有内容。" : memories.length >= maxTotal * 0.8 ? "，容量接近上限。" : ""}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <div>
          <p className="font-medium">允许 AI 使用和更新记忆</p>
          <p className="text-xs text-muted-foreground">关闭后保留现有内容，但聊天不会召回或自动整理记忆。</p>
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setMemoryMasterEnabledAction(!memoryEnabled);
              setMessage(result.message);
            })
          }
          variant={memoryEnabled ? "default" : "outline"}
        >
          {memoryEnabled ? "已开启" : "已关闭"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="筛选记忆"
          className="h-10 rounded-xl border bg-background px-3 text-sm"
          onChange={(event) => setFilter(event.target.value)}
          value={filter}
        >
          <option value="all">全部</option>
          <option value="global">全局记忆</option>
          <option value="persona">Persona 专属</option>
          <option value="enabled">已启用</option>
          <option value="disabled">已停用</option>
          <option value="pinned">已置顶</option>
          <option value="never">从未使用</option>
          <option value="stale">长期未使用</option>
          <option value="duplicates">同主题可能重复</option>
          {MEMORY_CATEGORIES.map((category) => (
            <option key={category} value={`category:${category}`}>
              {MEMORY_CATEGORY_LABELS[category]}
            </option>
          ))}
          {personas.map((persona) => (
            <option key={persona.id} value={`persona:${persona.id}`}>
              {persona.name}
            </option>
          ))}
        </select>
        <select aria-label="排序记忆" className="h-10 rounded-xl border bg-background px-3 text-sm" onChange={(event) => setSort(event.target.value)} value={sort}><option value="updated">最近更新</option><option value="used">最常使用</option><option value="importance">重要程度</option><option value="lastUsed">最近使用</option></select>
        <details className="relative ml-auto">
          <summary className="cursor-pointer rounded-xl border px-3 py-2 text-sm">更多操作</summary>
          <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border bg-card p-2 shadow-lg">
            <Button className="w-full justify-start" onClick={() => { setEditing(undefined); setFormOpen(true); }} variant="ghost">
              <Plus className="size-4" />手动添加记忆
            </Button>
          </div>
        </details>
      </div>
      {shown.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((memory) => (
            <article className="rounded-2xl border bg-card p-4" key={memory.id}>
              <div className="flex items-start gap-3">
                <Brain className="mt-1 size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{memory.content}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>
                      {MEMORY_CATEGORY_LABELS[
                        memory.category as keyof typeof MEMORY_CATEGORY_LABELS
                      ] ?? "其他"}
                    </span>
                    <span>{memory.scope === "GLOBAL" ? "全局" : memory.personaName || "Persona"}</span>
                    <span>重要程度 {memory.importance}</span>
                    {memory.pinned && <span>已置顶</span>}
                    <span>使用 {memory.useCount} 次</span>
                    <span>{memory.enabled ? "已启用" : "已停用"}</span>
                    <span>{memory.origin === "MANUAL" ? "手动添加" : "从对话中记住"}</span>
                    <span>更新于 {memory.updatedAt.slice(0, 10)}</span>
                    <span>最近使用 {memory.lastUsedAt ? memory.lastUsedAt.slice(0, 10) : "尚未使用"}</span>
                    {memory.topicKey && (duplicateTopics.get(`${memory.scope}:${memory.personaId ?? "global"}:${memory.topicKey}`) ?? 0) > 1 && <span className="text-amber-700">同主题可能重复</span>}
                  </div>
                  {memory.sourceConversationId ? (
                    <Link
                      className="mt-2 inline-block text-xs text-primary"
                      href={`/chat/${memory.sourceConversationId}`}
                    >
                      查看来源对话
                    </Link>
                  ) : memory.origin !== "MANUAL" ? (
                    <p className="mt-2 text-xs text-muted-foreground">来源对话已删除</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button disabled={pending} onClick={() => startTransition(async () => { const result = await setMemoryPinnedAction(memory.id, !memory.pinned); setMessage(result.message); })} size="sm" variant="ghost">{memory.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}{memory.pinned ? "取消置顶" : "置顶"}</Button>
                <Button
                  onClick={() => {
                    setEditing(memory);
                    setFormOpen(true);
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Pencil className="size-3.5" />编辑
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await setMemoryEnabledAction(memory.id, !memory.enabled);
                      setMessage(result.message);
                    })
                  }
                  size="sm"
                  variant="outline"
                >
                  {memory.enabled ? "停用" : "启用"}
                </Button>
                <Button
                  className="text-red-600"
                  onClick={() => setDeleting(memory)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5" />删除
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Brain className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">AI 还没有记住关于你的长期信息。</h2>
          <p className="mt-2 text-sm text-muted-foreground">在聊天中自然交流，值得长期保留的信息会出现在这里。</p>
        </div>
      )}
      <MemoryFormDialog
        initial={editing}
        onOpenChange={setFormOpen}
        onSaved={setMessage}
        open={formOpen}
        personas={personas}
      />
      {deleting && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-2xl border bg-card p-5">
            <h2 className="text-lg font-semibold">删除这条记忆？</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              只会删除长期记忆，不会删除对话、消息或 Persona。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setDeleting(undefined)} variant="outline">取消</Button>
              <Button
                className="bg-red-600 text-white"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteMemoryAction(deleting.id);
                    setMessage(result.message);
                    setDeleting(undefined);
                  })
                }
              >
                删除记忆
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
