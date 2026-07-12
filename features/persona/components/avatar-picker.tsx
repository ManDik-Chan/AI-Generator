"use client";

import Image from "next/image";
import { PERSONA_AVATARS } from "@/features/persona/constants";

export function AvatarPicker({ value, onChange }: { value?: string; onChange(value: string): void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">预设头像</legend>
      <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8" role="radiogroup" aria-label="选择预设头像">
        {PERSONA_AVATARS.map((avatar, index) => (
          <button aria-checked={value === avatar} aria-label={`头像 ${index + 1}`} className={value === avatar ? "rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-background" : "rounded-2xl hover:ring-2 hover:ring-muted"} key={avatar} onClick={() => onChange(avatar)} role="radio" type="button">
            <Image alt="" className="aspect-square w-full rounded-2xl" height={128} src={avatar} width={128} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
