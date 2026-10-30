import type { Metadata } from "next";

import { ArtSurface } from "@/components/platform/art";
import { PageIntro, SampleTag, SectionHead, StatusPill, delay } from "@/components/platform/primitives";
import type { ArtKey } from "@/features/landing/art";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { previewPersonas } from "@/features/platform/demo/hub";

export const metadata: Metadata = { title: "人格" };

const facts = [
  ["服务端拼装", "人格 Prompt 只在服务端组合，浏览器拿不到完整提示词。"],
  ["AI 辅助生成", "用一句话描述，生成可编辑的人格草稿与头像。"],
  ["会话绑定", "每个对话绑定一个人格，回收站可以恢复已删除的人格。"],
] as const;

const arts: ArtKey[] = ["persona", "memory", "dawn", "moss"];

export default function DemoPersonasPage() {
  return (
    <div className="pb-6">
      <PageIntro
        description="为不同任务建立独立的角色、语气与边界。人格可以在对话中切换，也会成为项目与 Agent 的默认助手。"
        kicker="AI Hub · 人格"
        meta={<StatusPill status="live" />}
        title="每项任务，一个人格。"
      />
      <SectionHead meta={<SampleTag />}>人格</SectionHead>
      <div className="grid gap-x-4 gap-y-10 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
        {previewPersonas.map((persona, index) => (
          <article className="enter" key={persona.id} style={delay(80 + index * 70)}>
            <ArtSurface className="grid aspect-[4/5] place-items-center rounded-card" k={arts[index % arts.length]}>
              <PersonaAvatar className="size-24 rounded-[1.75rem] shadow-[0_20px_40px_-20px_hsl(var(--overlay)/.6)]" name={persona.name} src={persona.avatarUrl} />
            </ArtSurface>
            <h3 className="mt-4 text-[1.25rem] font-medium tracking-[-.02em]">{persona.name}</h3>
            <p className="mt-1 text-[.8125rem] text-muted-foreground">{persona.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {persona.tone.map((tone) => <span className="rounded-full border border-border/14 px-2 py-0.5 text-[.6875rem] text-muted-foreground" key={tone}>{tone}</span>)}
              <span className="ml-auto text-[.6875rem] text-muted-foreground">{persona.uses}</span>
            </div>
          </article>
        ))}
      </div>
      <section aria-label="人格能力说明" className="mt-16 grid gap-0.5 min-[821px]:grid-cols-3">
        {facts.map(([title, detail], index) => (
          <div className="flex min-h-[8rem] flex-col rounded-card bg-surface p-5" key={title}>
            <span className="font-code text-[.6875rem] text-muted-foreground">0{index + 1}</span>
            <p className="mt-auto pt-6 text-sm font-medium">{title}</p>
            <p className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
