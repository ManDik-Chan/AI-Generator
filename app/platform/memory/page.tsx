import type { Metadata } from "next";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlockLabel, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { SampleBadge } from "@/features/platform-preview/components/status-badge";
import { previewMemories, previewProposals } from "@/features/platform-preview/data/hub";
import { MEMORY_CATEGORY_LABELS } from "@/features/memory/constants";
import { getMemoryVerificationLabel } from "@/features/memory/verification";
import { hubModules } from "@/features/platform-preview/navigation";

export const metadata: Metadata = { title: "Memory 长期记忆" };

export default function PlatformMemoryPage() {
  return (
    <div className="pb-6">
      <PreviewHeader
        description="AI 只会提出记忆建议，由你逐条接受或拒绝；每条正式记忆都标明来源与核对方式，并按全局或单个人格隔离作用域。"
        module={hubModules[2]}
        title="只记住你确认过的事。"
      />

      <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="memory-list" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="memory-list" meta={<SampleBadge />}>正式记忆</BlockLabel>
          <ul className="border-t border-border/14">
            {previewMemories.map((memory) => (
              <li className="border-b border-border/14 py-3.5" key={memory.content}>
                <p className="text-sm">{memory.content}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[.6875rem]">
                  <span className="premium-chip">{MEMORY_CATEGORY_LABELS[memory.category as keyof typeof MEMORY_CATEGORY_LABELS]}</span>
                  <span className="premium-chip">{memory.scope === "GLOBAL" ? "全局" : "当前 Persona"}</span>
                  <span className="premium-chip">{getMemoryVerificationLabel(memory.verification)}</span>
                </div>
                <p className="mt-1.5 text-caption">{memory.source}</p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="memory-proposals" className="rounded-card bg-surface p-4 min-[821px]:p-5">
          <BlockLabel id="memory-proposals" meta={<SampleBadge />}>记忆建议 · {previewProposals.length} 条待确认</BlockLabel>
          <ul className="space-y-2">
            {previewProposals.map((proposal) => (
              <li className="rounded-control bg-background/60 p-3" key={proposal.content}>
                <p className="text-sm">{proposal.content}</p>
                <p className="mt-1 text-caption">{proposal.source}</p>
                <div className="mt-3 flex gap-2">
                  <Button disabled size="sm" title="演示预览不可操作"><Check className="size-3.5" />接受</Button>
                  <Button disabled size="sm" title="演示预览不可操作" variant="outline"><X className="size-3.5" />拒绝</Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption">演示预览中的按钮不可操作。真实记忆只在登录后的「长期记忆」中管理。</p>
        </section>
      </div>
    </div>
  );
}
