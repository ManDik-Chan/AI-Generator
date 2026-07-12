"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Brain, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteMemoryAction,
  setMemoryEnabledAction,
  setMemoryMasterEnabledAction,
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
}

export function MemoryManager({
  memories,
  personas,
  memoryEnabled,
  initialPersonaId,
}: MemoryManagerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryView>();
  const [deleting, setDeleting] = useState<MemoryView>();
  const [filter, setFilter] = useState(initialPersonaId ? `persona:${initialPersonaId}` : "all");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const shown = useMemo(
    () =>
      memories.filter(
        (memory) =>
          filter === "all" ||
          (filter === "global" && memory.scope === "GLOBAL") ||
          (filter === "persona" && memory.scope === "PERSONA") ||
          (filter === "enabled" && memory.enabled) ||
          (filter === "disabled" && !memory.enabled) ||
          filter === `category:${memory.category}` ||
          filter === `persona:${memory.personaId}`,
      ),
    [memories, filter],
  );

  return (
    <div className="space-y-5">
      {message && (
        <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <div>
          <p className="font-medium">使用长期记忆</p>
          <p className="text-xs text-muted-foreground">关闭后保留数据，但聊天不会召回记忆。</p>
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
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />创建记忆
        </Button>
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
                    <span>{memory.enabled ? "已启用" : "已停用"}</span>
                    <span>{memory.origin === "CHAT_MESSAGE" ? "聊天消息" : "手动"}</span>
                    <span>更新于 {memory.updatedAt.slice(0, 10)}</span>
                  </div>
                  {memory.sourceConversationId ? (
                    <Link
                      className="mt-2 inline-block text-xs text-primary"
                      href={`/chat/${memory.sourceConversationId}`}
                    >
                      查看来源对话
                    </Link>
                  ) : memory.origin === "CHAT_MESSAGE" ? (
                    <p className="mt-2 text-xs text-muted-foreground">来源对话已删除</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
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
          <h2 className="mt-3 font-semibold">还没有长期记忆</h2>
          <Button className="mt-4" onClick={() => setFormOpen(true)}>
            创建第一条记忆
          </Button>
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
