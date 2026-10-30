import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BrainCircuit, History, Image, ImagePlus, Languages, PenLine, Repeat2 } from "lucide-react";

import { BlockLabel, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { StatusBadge } from "@/features/platform-preview/components/status-badge";
import { previewTools } from "@/features/platform-preview/data/hub";
import { hubModules } from "@/features/platform-preview/navigation";

export const metadata: Metadata = { title: "Tools AI 工具" };

const icons = { summarize: PenLine, rewrite: Repeat2, translate: Languages, image: Image, "image-generate": ImagePlus, brainstorm: BrainCircuit, history: History } as const;

export default function PlatformToolsPage() {
  return (
    <div className="pb-6">
      <PreviewHeader
        description="文本、图像与协作工具共用同一套身份、额度与运行记录。以下工具均已上线，登录后即可使用；它们也会成为 Skills 的第一批底层能力。"
        module={hubModules[3]}
        title="工具接入同一个工作台。"
      />

      <section aria-labelledby="tool-list">
        <BlockLabel id="tool-list" meta={<span className="text-caption">点击进入真实工具（需登录）</span>}>全部工具</BlockLabel>
        <div className="grid items-stretch gap-0.5 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {previewTools.map((tool) => {
            const Icon = icons[tool.id];
            return (
              <Link className="group flex min-h-[12.5rem] scroll-mt-24 flex-col rounded-card bg-surface p-4 transition-colors duration-500 ease-out-expo hover:bg-surface-muted" href={tool.href} id={tool.id} key={tool.id} prefetch={false}>
                <span className="flex items-start justify-between gap-3">
                  <span className="premium-icon-tile size-10 rounded-full"><Icon className="size-4" /></span>
                  <StatusBadge status="live" />
                </span>
                <span className="mt-5 block text-card-title">{tool.title}</span>
                <span className="mt-1 block text-caption">{tool.description}</span>
                <span className="mt-auto flex items-end justify-between gap-3 pt-5">
                  <span className="text-[.6875rem] text-muted-foreground">{tool.group}</span>
                  <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
