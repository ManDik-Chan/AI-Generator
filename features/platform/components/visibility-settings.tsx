"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { visibilityMeta } from "@/features/platform/labels";
import type { Visibility } from "@/features/platform/types";
import { cn } from "@/lib/utils";

const consequences: Record<Visibility, Partial<Record<Visibility, string>>> = {
  PUBLIC: {
    UNLISTED: "项目会从探索目录移除；已经持有链接的人仍能浏览公开内容。",
    PRIVATE: "公开页会立即失效；已发布版本保留在项目内，但只对成员可见。",
  },
  UNLISTED: {
    PUBLIC: "项目会进入探索目录。所有公开资产需要已批准，否则发布会被拒绝。",
    PRIVATE: "现有链接立即失效，只有成员可以访问。",
  },
  PRIVATE: {
    UNLISTED: "需要先通过独立审核；之后持有链接的人可以浏览公开内容。",
    PUBLIC: "需要先通过独立审核，所有公开资产必须已批准。",
  },
};

/** Visibility switch with spelled-out consequences. Demo state: never saved. */
export function VisibilitySettings({ initial }: { initial: Visibility }) {
  const [value, setValue] = useState<Visibility>(initial);
  const note = value === initial ? null : consequences[initial][value];
  return (
    <fieldset>
      <legend className="text-sm font-medium">项目可见性</legend>
      <p className="mt-1 text-[.75rem] text-muted-foreground">只决定谁能看见项目本身。使用者的输入、结果与凭据永远不因此公开。</p>
      <div className="mt-4 grid gap-0.5 min-[821px]:grid-cols-3">
        {(Object.keys(visibilityMeta) as Visibility[]).map((key) => (
          <label className={cn("flex cursor-pointer flex-col rounded-card p-4 transition-colors duration-300", value === key ? "bg-foreground text-background" : "bg-surface hover:bg-surface-muted")} key={key}>
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{visibilityMeta[key].label}</span>
              <input checked={value === key} className="size-4 accent-[hsl(var(--lime))]" name="visibility" onChange={() => setValue(key)} type="radio" value={key} />
            </span>
            <span className={cn("mt-6 font-code text-[.6875rem]", value === key ? "text-background/70" : "text-muted-foreground")}>{key}</span>
            <span className={cn("mt-1 text-[.8125rem] leading-5", value === key ? "text-background/80" : "text-muted-foreground")}>{visibilityMeta[key].detail}</span>
          </label>
        ))}
      </div>
      <div aria-live="polite" className="mt-4 min-h-[3rem]">
        {note ? <p className="rounded-card bg-warning-subtle px-4 py-3 text-[.8125rem] leading-5 text-warning-foreground">{note}</p> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button disabled size="sm">保存更改</Button>
        <span className="text-[.75rem] text-muted-foreground">演示状态：Registry 部署后才能保存。</span>
      </div>
    </fieldset>
  );
}
