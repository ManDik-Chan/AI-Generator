import type { Metadata } from "next";
import Link from "next/link";

import { ArtSurface } from "@/components/platform/art";
import { LoopArrow, PageIntro, SectionHead, StatusPill, delay } from "@/components/platform/primitives";
import type { ArtKey } from "@/features/landing/art";
import { previewTools } from "@/features/platform/demo/hub";

export const metadata: Metadata = { title: "工具" };

const arts: Record<string, ArtKey> = { summarize: "stone", rewrite: "moss", translate: "memory", image: "image", "image-generate": "dawn", brainstorm: "agents", history: "slate" };

export default function DemoToolsPage() {
  return (
    <div className="pb-6">
      <PageIntro
        description="文本、图像与协作工具共用同一套身份、额度与运行记录。以下工具都已上线，登录后即可使用；在项目平台中，它们是内置 AI Hub 提供的能力。"
        kicker="AI Hub · 工具"
        meta={<StatusPill status="live" />}
        title="工具接入同一个工作台。"
      />
      <SectionHead meta={<span className="text-caption">点击进入真实工具（需要登录）</span>}>全部工具</SectionHead>
      <div className="grid gap-x-4 gap-y-10 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
        {previewTools.map((tool, index) => (
          <Link className="enter group flex scroll-mt-28 flex-col" href={tool.href} id={tool.id} key={tool.id} prefetch={false} style={delay(60 + index * 60)}>
            <ArtSurface className="aspect-[4/3] rounded-card" k={arts[tool.id] ?? "stone"} zoom>
              <span className="absolute left-3 top-3 rounded-full bg-[hsl(var(--paper)/.92)] px-2.5 py-1 text-[.6875rem] text-[hsl(var(--ink))]">{tool.group}</span>
            </ArtSurface>
            <span className="mt-3.5 flex items-center gap-2 text-[1.0625rem] font-medium tracking-[-.015em]"><span className="link-grow">{tool.title}</span><LoopArrow className="ml-auto text-muted-foreground group-hover:text-foreground" dir="ur" /></span>
            <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{tool.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
