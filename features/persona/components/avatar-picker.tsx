"use client";

import Image from "next/image";
import { PERSONA_AVATARS } from "@/features/persona/constants";

export function AvatarPicker({ value, onChange }: { value?: string; onChange(value: string): void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">预设头像</legend>
      <p className="mt-1 text-xs text-muted-foreground">头像来源对聊天页保持透明，之后更换头像无需重构聊天组件。</p>
      <div className="mt-3 grid grid-cols-4 gap-3 min-[430px]:grid-cols-5 sm:grid-cols-8" role="radiogroup" aria-label="选择预设头像">
        {PERSONA_AVATARS.map((avatar, index) => (
          <button aria-checked={value === avatar} aria-label={`头像 ${index + 1}`} className={value === avatar ? "rounded-control bg-primary-subtle p-1.5 ring-2 ring-primary ring-offset-2 ring-offset-background" : "rounded-control border border-border/10 bg-surface-muted p-1.5 transition hover:-translate-y-0.5 hover:border-primary/25"} key={avatar} onClick={() => onChange(avatar)} role="radio" type="button">
            <Image alt="" className="aspect-square w-full rounded-[.7rem]" height={128} src={avatar} width={128} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
