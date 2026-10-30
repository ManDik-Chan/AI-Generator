import type { Metadata } from "next";

import { BlockLabel, PreviewHeader } from "@/features/platform-preview/components/blocks";
import { SampleBadge } from "@/features/platform-preview/components/status-badge";
import { previewPersonas } from "@/features/platform-preview/data/hub";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { hubModules } from "@/features/platform-preview/navigation";

export const metadata: Metadata = { title: "Personas 专属人格" };

const facts = [
  ["服务端拼装", "人格 Prompt 只在服务端组合，浏览器拿不到完整提示词。"],
  ["AI 辅助生成", "用一句话描述，生成可编辑的人格草稿与头像。"],
  ["会话绑定", "每个对话绑定一个人格，回收站可恢复已删除人格。"],
] as const;

export default function PlatformPersonasPage() {
  return (
    <div className="pb-6">
      <PreviewHeader
        description="为不同任务建立独立的角色、语气与边界。人格可以在对话中切换，也将作为项目与 Agent 的默认助手。"
        module={hubModules[1]}
        title="每项任务一个人格。"
      />

      <section aria-labelledby="persona-list">
        <BlockLabel id="persona-list" meta={<SampleBadge />}>人格</BlockLabel>
        <div className="grid items-stretch gap-0.5 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {previewPersonas.map((persona) => (
            <article className="flex min-h-[15rem] flex-col rounded-card bg-surface p-4" key={persona.id}>
              <PersonaAvatar className="size-14 rounded-full" name={persona.name} src={persona.avatarUrl} />
              <h3 className="mt-5 text-card-title">{persona.name}</h3>
              <p className="mt-1 text-caption">{persona.description}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
                {persona.tone.map((tone) => <span className="premium-chip" key={tone}>{tone}</span>)}
                <span className="ml-auto text-[.6875rem] text-muted-foreground">{persona.uses}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="人格能力说明" className="mt-0.5 grid gap-0.5 min-[821px]:grid-cols-3">
        {facts.map(([title, detail]) => (
          <div className="rounded-card bg-surface p-4 min-[821px]:p-5" key={title}><p className="text-sm font-medium">{title}</p><p className="mt-1 text-caption">{detail}</p></div>
        ))}
      </section>
    </div>
  );
}
