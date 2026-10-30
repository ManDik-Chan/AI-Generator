import type { Metadata } from "next";
import { Check, X } from "lucide-react";

import { PageIntro, SampleTag, SectionHead, StatusPill } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { MEMORY_CATEGORY_LABELS } from "@/features/memory/constants";
import { getMemoryVerificationLabel } from "@/features/memory/verification";
import { previewMemories, previewProposals } from "@/features/platform/demo/hub";

export const metadata: Metadata = { title: "记忆" };

export default function DemoMemoryPage() {
  return (
    <div className="pb-6">
      <PageIntro
        description="AI 只会提出记忆建议，由你逐条接受或拒绝；每条正式记忆都标明来源与核验方式，并按全局或单个人格隔离作用域。"
        kicker="AI Hub · 记忆"
        meta={<StatusPill status="live" />}
        title={["只记住", "你确认过的事。"]}
      />
      <div className="grid gap-x-12 gap-y-12 min-[1024px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="memory-list">
          <SectionHead id="memory-list" meta={<SampleTag />}>正式记忆</SectionHead>
          <ul className="border-t border-border/12">
            {previewMemories.map((memory) => (
              <li className="border-b border-border/12 py-4" key={memory.content}>
                <p className="text-[1rem] font-medium tracking-[-.01em]">{memory.content}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[.6875rem]">
                  <span className="rounded-full bg-surface px-2 py-0.5">{MEMORY_CATEGORY_LABELS[memory.category as keyof typeof MEMORY_CATEGORY_LABELS]}</span>
                  <span className="rounded-full bg-surface px-2 py-0.5">{memory.scope === "GLOBAL" ? "全局" : "当前人格"}</span>
                  <span className="rounded-full bg-lime px-2 py-0.5 text-[hsl(var(--ink))]">{getMemoryVerificationLabel(memory.verification)}</span>
                </div>
                <p className="mt-2 text-[.75rem] text-muted-foreground">{memory.source}</p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="memory-proposals" className="self-start rounded-card bg-surface p-5">
          <SectionHead id="memory-proposals" meta={<SampleTag />}>{"记忆建议 · " + previewProposals.length + " 条待确认"}</SectionHead>
          <ul className="space-y-2">
            {previewProposals.map((proposal) => (
              <li className="rounded-control bg-surface-raised p-4" key={proposal.content}>
                <p className="text-sm font-medium">{proposal.content}</p>
                <p className="mt-1 text-[.75rem] text-muted-foreground">{proposal.source}</p>
                <div className="mt-3 flex gap-2">
                  <Button disabled size="sm" title="演示工作台不可操作"><Check className="size-3.5" />接受</Button>
                  <Button disabled size="sm" title="演示工作台不可操作" variant="outline"><X className="size-3.5" />拒绝</Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[.75rem] leading-5 text-muted-foreground">待确认的建议不会用于对话、召回或统计，30 天后自动过期。真实记忆只在登录后的「记忆」中管理。</p>
        </section>
      </div>
    </div>
  );
}
