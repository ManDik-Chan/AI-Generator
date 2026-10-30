import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { ShellMode } from "@/components/layout/navigation";
import { ArtSurface } from "@/components/platform/art";
import { LoopArrow, PageIntro, SampleTag, SectionHead, StatusPill, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import type { ArtKey } from "@/features/landing/art";
import type { HomeMetrics } from "@/features/home/presentation";
import type { CapabilityStatus } from "@/features/platform/status";
import { cn } from "@/lib/utils";

interface HubModule {
  key: string;
  word: string;
  english: string;
  detail: string;
  live: string;
  demo: string;
  art: ArtKey;
  status: CapabilityStatus;
  count?: (metrics: HomeMetrics) => string | undefined;
}

const modules: HubModule[] = [
  { key: "chat", word: "对话", english: "Chat", detail: "流式回答、会话历史与 Markdown；回答下方披露本轮引用的已确认记忆。", live: "/chat", demo: "/platform/chat", art: "chat", status: "live", count: (m) => `${m.conversations} 段对话` },
  { key: "personas", word: "人格", english: "Personas", detail: "为不同任务设定角色、语气与边界；人格 Prompt 只在服务端拼装。", live: "/personas", demo: "/platform/personas", art: "persona", status: "live", count: (m) => `${m.personas} 个人格` },
  { key: "memories", word: "记忆", english: "Memory", detail: "模型只提出建议，你确认后才写入；每条记忆标注来源，可随时核对或关闭。", live: "/memories", demo: "/platform/memory", art: "memory", status: "live", count: (m) => `${m.memories} 条记忆${m.pendingProposals ? ` · ${m.pendingProposals} 待确认` : ""}` },
  { key: "tools", word: "工具", english: "Tools", detail: "总结、改写、翻译、图片理解、图片生成与多视角头脑风暴，各有独立历史。", live: "/tools", demo: "/platform/tools", art: "dawn", status: "live", count: (m) => `${m.toolRuns} 次运行 · ${m.generatedImages} 张图片` },
  { key: "agents", word: "Agent", english: "Agent", detail: "Planner 拆解任务，多个 Worker 并行推理，协调器收束；Draft 验收中。", live: "/agents", demo: "/platform/agent", art: "agents", status: "dev", count: (m) => (m.activeAgentRuns ? `${m.activeAgentRuns} 个运行中` : undefined) },
];

const tools: [string, string, string][] = [
  ["文本总结", "/tools/summarize", "把长文整理成要点"],
  ["改写", "/tools/rewrite", "按目标语气改写"],
  ["翻译", "/tools/translate", "保留语气与格式"],
  ["图片理解", "/tools/image", "读懂截图与图表"],
  ["图片生成", "/tools/image-generate", "一句话生成一张图"],
  ["多 Agent 头脑风暴", "/tools/brainstorm", "四个视角，一份综合"],
];

export function HubOverview({ mode, metrics }: { mode: ShellMode; metrics?: HomeMetrics }) {
  const demo = mode === "demo";
  return (
    <div className="pb-6">
      <PageIntro
        actions={<Button asChild size="lg"><Link href={demo ? "/platform/chat" : "/chat"} prefetch={false}>开始新对话<ArrowUpRight className="size-4" /></Link></Button>}
        description="对话、人格、长期记忆、工具与 Agent 共享同一套身份与数据边界。它们已经上线，是平台内置的第一方能力。"
        kicker="AI Hub"
        meta={demo ? <SampleTag>示例数据</SampleTag> : <StatusPill status="live" />}
        title={["平台内置的", "AI 工作伙伴。"]}
      />

      <ul className="grid gap-x-4 gap-y-12 min-[821px]:grid-cols-2 min-[1281px]:grid-cols-6">
        {modules.map((module, index) => {
          const count = metrics && module.count ? module.count(metrics) : undefined;
          return (
            <li className={cn("enter", index < 2 ? "min-[1281px]:col-span-3" : "min-[1281px]:col-span-2")} key={module.key} style={delay(80 + index * 70)}>
              <Link className="group flex h-full flex-col" href={demo ? module.demo : module.live} prefetch={false}>
                <ArtSurface className={cn("w-full rounded-card", index < 2 ? "aspect-[16/9]" : "aspect-[4/3]")} k={module.art} zoom>
                  <span className="absolute left-4 top-4 rounded-full bg-[hsl(var(--paper)/.92)] px-2.5 py-1 font-code text-[.6875rem] text-[hsl(var(--ink))]">{module.english}</span>
                  {count ? <span className="absolute bottom-4 left-4 rounded-full bg-[hsl(var(--ink)/.55)] px-2.5 py-1 text-[.6875rem] text-[hsl(var(--paper))] backdrop-blur-sm">{count}</span> : null}
                </ArtSurface>
                <span className="mt-4 flex items-center gap-3">
                  <span className="text-[clamp(1.75rem,2.6vw,2.5rem)] font-medium leading-none tracking-[-.04em]">{module.word}</span>
                  <StatusPill status={module.status} />
                  <LoopArrow className="ml-auto text-lg text-muted-foreground group-hover:text-foreground" dir="ur" />
                </span>
                <span className="mt-2 max-w-[34rem] text-[.8125rem] leading-5 text-muted-foreground">{module.detail}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="hub-tools" className="mt-20">
        <SectionHead id="hub-tools">工具</SectionHead>
        <ul className="grid gap-x-10 border-b border-border/12 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-3">
          {tools.map(([label, href, detail], index) => (
            <li className="border-t border-border/12" key={href}>
              <Link className="group flex min-h-[5.5rem] items-center gap-4 py-4" href={demo ? "/platform/tools" : href} prefetch={false}>
                <span className="font-code text-[.6875rem] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1"><span className="link-grow block w-fit text-[1.0625rem] font-medium tracking-[-.015em]">{label}</span><span className="mt-1 block text-[.75rem] text-muted-foreground">{detail}</span></span>
                <LoopArrow className="text-muted-foreground group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
