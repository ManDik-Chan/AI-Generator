"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Puzzle } from "lucide-react";

import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge } from "@/features/platform-preview/components/status-badge";
import { previewSkills, skillCategories, type PreviewSkill } from "@/features/platform-preview/data/skills";
import { cn } from "@/lib/utils";

export function DemoSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange(next: boolean): void; label: string; disabled?: boolean }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn("relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-300 disabled:opacity-45", checked ? "border-foreground bg-foreground" : "border-border/20 bg-surface-raised")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={cn("absolute left-0.5 size-[1.125rem] rounded-full transition-transform duration-300 ease-out-expo", checked ? "translate-x-4 bg-lime" : "bg-muted-foreground/50")} />
    </button>
  );
}

function SkillCard({ skill }: { skill: PreviewSkill }) {
  return (
    <Link className="group flex min-h-[12.5rem] flex-col rounded-card bg-surface p-4 transition-colors duration-500 ease-out-expo hover:bg-surface-muted" href={`/platform/skills/${skill.slug}`} prefetch={false}>
      <span className="flex items-start justify-between gap-3">
        <span className="premium-icon-tile size-10 rounded-full"><Puzzle className="size-4" /></span>
        <span className="flex flex-wrap justify-end gap-1"><span className="premium-chip min-h-0 py-0.5">{skill.category}</span></span>
      </span>
      <span className="mt-5 block text-card-title">{skill.name}</span>
      <span className="mt-1 block text-caption">{skill.summary}</span>
      <span className="mt-auto flex items-end justify-between gap-3 pt-5">
        <span className="text-[.6875rem] text-muted-foreground">{skill.capability === "live" ? `底层能力已上线 · ${skill.liveTool?.label}` : "底层能力规划中"}</span>
        <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </span>
    </Link>
  );
}

export function SkillCatalog() {
  const [category, setCategory] = useState<(typeof skillCategories)[number]>("全部");
  const shown = previewSkills.filter((skill) => category === "全部" || skill.category === category);
  return (
    <div>
      <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
        <SegmentedControl label="按类别筛选">
          {skillCategories.map((item) => <Segment active={category === item} key={item} onClick={() => setCategory(item)}>{item}</Segment>)}
        </SegmentedControl>
      </div>
      <div className="grid items-stretch gap-0.5 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
        {shown.map((skill) => <SkillCard key={skill.slug} skill={skill} />)}
      </div>
    </div>
  );
}

const managerColumns = "gap-x-4 min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_6.5rem_3.5rem]";

/** Demo management list: switches only change local state and are never saved. */
export function SkillManager() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(previewSkills.map((skill) => [skill.slug, skill.enabled])));
  const [touched, setTouched] = useState(false);
  return (
    <div>
      {/* Phones: name + switch, then permissions, then capability. From 640px: one four-column row. */}
      <div className="border-t border-border/14 text-sm">
        <div aria-hidden="true" className={cn(managerColumns, "hidden border-b border-border/14 py-2.5 text-[.6875rem] text-muted-foreground min-[640px]:grid")}>
          <span>Skill</span><span>所需权限</span><span>底层能力</span><span className="text-right">启用</span>
        </div>
        <ul>
          {previewSkills.map((skill) => (
            <li className={cn(managerColumns, "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-y-1.5 border-b border-border/14 py-3")} key={skill.slug}>
              <Link className="link-grow col-start-1 row-start-1 w-fit font-medium" href={`/platform/skills/${skill.slug}`} prefetch={false}>{skill.name}</Link>
              <span className="col-span-2 row-start-2 text-caption min-[640px]:col-span-1 min-[640px]:col-start-2 min-[640px]:row-start-1">
                <span className="min-[640px]:hidden">权限：</span>{skill.permissions.join("、")}
              </span>
              <span className="col-span-2 row-start-3 flex items-center gap-1.5 min-[640px]:col-span-1 min-[640px]:col-start-3 min-[640px]:row-start-1">
                <span className="text-caption min-[640px]:hidden">底层能力</span><StatusBadge status={skill.capability} />
              </span>
              <span className="col-start-2 row-start-1 justify-self-end min-[640px]:col-start-4">
                <DemoSwitch checked={enabled[skill.slug]} disabled={skill.capability !== "live"} label={`启用 ${skill.name}`} onChange={(next) => { setEnabled((value) => ({ ...value, [skill.slug]: next })); setTouched(true); }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p aria-live="polite" className="mt-3 text-caption">{touched ? "演示预览：开关只在本页切换，刷新后恢复，不会保存或影响任何账户。" : "规划中的 Skill 不能启用；已上线能力目前以 Tools 形式使用。"}</p>
    </div>
  );
}
