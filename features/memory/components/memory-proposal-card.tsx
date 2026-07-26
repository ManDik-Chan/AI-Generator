"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Pencil, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StatusBanner } from "@/components/ui/status-banner";
import {
  acceptEditedMemoryProposalAction,
  acceptMemoryProposalAction,
  rejectMemoryProposalAction,
} from "@/features/memory/actions";
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
} from "@/features/memory/constants";
import type {
  MemoryActionResult,
  MemoryProposalView,
} from "@/features/memory/types";

interface MemoryProposalCardProps {
  proposal: MemoryProposalView;
  personas: Array<{ id: string; name: string }>;
  memoryEnabled: boolean;
  onResolved: (
    proposalId: string,
    snapshot?: MemoryActionResult["resolutionSnapshot"],
  ) => void;
}

export function MemoryProposalCard({
  proposal,
  personas,
  memoryEnabled,
  onResolved,
}: MemoryProposalCardProps) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string }>();
  const [draft, setDraft] = useState({
    content: proposal.content,
    category: proposal.category,
    scope: proposal.scope,
    personaId: proposal.personaId ?? "",
    importance: proposal.importance,
    topicKey: proposal.topicKey ?? "",
    keywords: proposal.keywords.join("，"),
  });
  const formId = `memory-proposal-edit-${proposal.id}`;

  const run = (task: () => Promise<{
    success: boolean;
    message: string;
    stateChanged?: boolean;
    finalStatus?: string;
    resolutionSnapshot?: MemoryActionResult["resolutionSnapshot"];
  }>) => {
    startTransition(async () => {
      try {
        const result = await task();
        setNotice({ success: result.success, message: result.message });
        if (result.success) setEditOpen(false);
        if (
          result.stateChanged
          && result.finalStatus
          && result.finalStatus !== "PENDING"
        ) {
          onResolved(proposal.id, result.resolutionSnapshot);
        }
      } catch {
        setNotice({
          success: false,
          message: "网络或服务暂时不可用，请检查连接后重试。",
        });
      }
    });
  };

  const conflictMessage = {
    NONE: undefined,
    TARGET_CHANGED: "目标记忆已被编辑或停用；请刷新后处理新版本建议。",
    TARGET_MISSING: "目标记忆已不可用，这条更新建议不能降级为新增。",
    TOPIC_CONFLICT: "生成建议后出现了同主题记忆；本建议不会覆盖它。",
    DISABLED_DUPLICATE: "相同内容的正式记忆已停用；请先处理该记忆。",
  }[proposal.conflictState];

  return (
    <article className="premium-panel min-w-0 overflow-hidden p-4 sm:p-5" data-memory-proposal-id={proposal.id}>
      {notice && (
        <div className="mb-4">
          <StatusBanner
            title={notice.success ? "建议已处理" : "暂时无法处理"}
            variant={notice.success ? "success" : "error"}
          >
            {notice.message}
          </StatusBanner>
        </div>
      )}

      <div className="flex items-start gap-3">
        <span className="premium-icon-tile size-10 shrink-0">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="premium-kicker">
              {proposal.actionLabel}
            </span>
            <span className="premium-chip">
              {MEMORY_CATEGORY_LABELS[
                proposal.category as keyof typeof MEMORY_CATEGORY_LABELS
              ] ?? "其他"}
            </span>
            <span className="premium-chip">{proposal.confidenceLabel}</span>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
            {proposal.content}
          </p>
        </div>
      </div>

      {proposal.actionLabel === "建议更新" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2" aria-label="原记忆与建议内容对照">
          <div className="rounded-xl border border-border/15 bg-surface-muted/60 p-3">
            <p className="text-xs font-semibold text-muted-foreground">当前正式记忆</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
              {proposal.currentTargetContent ?? "原记忆已删除或不可用"}
            </p>
          </div>
          <div className="rounded-xl border border-primary/15 bg-primary-subtle p-3">
            <p className="text-xs font-semibold text-primary-subtle-foreground">AI 建议内容</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
              {proposal.content}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="premium-chip">
          {proposal.scope === "GLOBAL" ? "全局" : proposal.personaName ?? "Persona"}
        </span>
        <span className="premium-chip">重要程度 {proposal.importance}</span>
        <span className="premium-chip">
          到期 {proposal.expiresAt.slice(0, 10)}
        </span>
      </div>

      <div className="mt-4 border-t border-border/10 pt-3 text-xs text-muted-foreground">
        <p>建议于 {proposal.createdAt.slice(0, 10)} 生成</p>
        {proposal.sourceConversationId ? (
          <Link
            className="mt-2 inline-flex min-h-9 items-center font-medium text-primary hover:underline"
            href={`/chat/${proposal.sourceConversationId}`}
            prefetch={false}
          >
            查看来源对话
            {proposal.sourceConversationTitle ? `：${proposal.sourceConversationTitle}` : ""}
          </Link>
        ) : (
          <p className="mt-2">来源对话已删除</p>
        )}
      </div>

      {!memoryEnabled && (
        <p className="mt-3 text-xs text-warning-foreground">
          长期记忆已关闭；你仍可拒绝建议，开启后才能确认。
        </p>
      )}
      {conflictMessage && (
        <div className="mt-3">
          <StatusBanner title="建议与当前记忆冲突" variant="error">
            {conflictMessage}
          </StatusBanner>
        </div>
      )}
      <div className="mt-4 grid gap-2 border-t border-border/10 pt-3 min-[430px]:grid-cols-3">
        <Button
          className="w-full"
          disabled={pending || !memoryEnabled || !proposal.canAccept}
          onClick={() => run(() => acceptMemoryProposalAction(proposal.id))}
          size="sm"
        >
          <Check className="size-3.5" />
          接受
        </Button>
        <Button
          className="w-full"
          disabled={pending || !memoryEnabled || !proposal.canAccept}
          onClick={() => setEditOpen(true)}
          size="sm"
          variant="outline"
        >
          <Pencil className="size-3.5" />
          编辑后接受
        </Button>
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => run(() => rejectMemoryProposalAction(proposal.id))}
          size="sm"
          variant="ghost"
        >
          <X className="size-3.5" />
          拒绝
        </Button>
      </div>

      <Dialog
        description="只允许修改将写入正式记忆的业务字段；来源、状态和置信度由服务端保持。"
        footer={(
          <>
            <Button disabled={pending} onClick={() => setEditOpen(false)} variant="outline">
              取消
            </Button>
            <Button disabled={pending || !memoryEnabled} form={formId} type="submit">
              验证并接受
            </Button>
          </>
        )}
        onOpenChange={(open) => {
          if (!pending) setEditOpen(open);
        }}
        open={editOpen}
        title="编辑建议后接受"
      >
        <form
          className="space-y-4"
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            run(() => acceptEditedMemoryProposalAction(proposal.id, {
              content: draft.content,
              category: draft.category as (typeof MEMORY_CATEGORIES)[number],
              scope: draft.scope,
              personaId: draft.scope === "PERSONA" ? draft.personaId : undefined,
              importance: draft.importance,
              topicKey: draft.topicKey.trim() || undefined,
              keywords: draft.keywords
                .split(/[，,]/)
                .map((keyword) => keyword.trim())
                .filter(Boolean),
            }));
          }}
        >
          <label className="block text-sm font-medium">
            记忆内容
            <textarea
              className="premium-field mt-2 min-h-28 resize-y p-3 text-sm"
              maxLength={500}
              onChange={(event) => setDraft((value) => ({
                ...value,
                content: event.target.value,
              }))}
              required
              value={draft.content}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              类别
              <select
                className="premium-field mt-2 h-11 px-3 text-sm"
                onChange={(event) => setDraft((value) => ({
                  ...value,
                  category: event.target.value,
                }))}
                value={draft.category}
              >
                {MEMORY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {MEMORY_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              作用域
              <select
                className="premium-field mt-2 h-11 px-3 text-sm"
                onChange={(event) => setDraft((value) => ({
                  ...value,
                  scope: event.target.value as "GLOBAL" | "PERSONA",
                }))}
                value={draft.scope}
              >
                <option value="GLOBAL">全局</option>
                <option value="PERSONA">Persona 专属</option>
              </select>
            </label>
          </div>
          {draft.scope === "PERSONA" && (
            <label className="block text-sm font-medium">
              Persona
              <select
                className="premium-field mt-2 h-11 px-3 text-sm"
                onChange={(event) => setDraft((value) => ({
                  ...value,
                  personaId: event.target.value,
                }))}
                required
                value={draft.personaId}
              >
                <option value="">请选择</option>
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>{persona.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm font-medium">
            重要程度（1–5）
            <input
              className="premium-field mt-2 h-11 px-3 text-sm"
              max={5}
              min={1}
              onChange={(event) => setDraft((value) => ({
                ...value,
                importance: Number(event.target.value),
              }))}
              type="number"
              value={draft.importance}
            />
          </label>
          <label className="block text-sm font-medium">
            主题键
            <input
              className="premium-field mt-2 h-11 px-3 text-sm"
              maxLength={80}
              onChange={(event) => setDraft((value) => ({
                ...value,
                topicKey: event.target.value,
              }))}
              placeholder="例如 preference.answer_style"
              value={draft.topicKey}
            />
          </label>
          <label className="block text-sm font-medium">
            关键词（逗号分隔）
            <input
              className="premium-field mt-2 h-11 px-3 text-sm"
              onChange={(event) => setDraft((value) => ({
                ...value,
                keywords: event.target.value,
              }))}
              value={draft.keywords}
            />
          </label>
        </form>
      </Dialog>
    </article>
  );
}
