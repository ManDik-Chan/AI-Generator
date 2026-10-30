"use client";

import { useState } from "react";

import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { DemoSwitch } from "@/features/platform-preview/components/skill-catalog";
import type { PreviewSkill } from "@/features/platform-preview/data/skills";

const scopes = ["全部对话", "仅 Agent", "指定项目"] as const;

/** Per-skill settings for the demo. Nothing is persisted. */
export function SkillSettings({ skill }: { skill: PreviewSkill }) {
  const [enabled, setEnabled] = useState(skill.enabled);
  const [scope, setScope] = useState<(typeof scopes)[number]>("全部对话");
  const [granted, setGranted] = useState<Record<string, boolean>>(() => Object.fromEntries(skill.permissions.map((permission) => [permission, true])));
  const [touched, setTouched] = useState(false);
  const locked = skill.capability !== "live";
  const touch = () => setTouched(true);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-sm font-medium">启用此 Skill</p><p className="mt-0.5 text-caption">{locked ? "底层能力尚未实现，暂不能启用。" : "启用后可在对话与 Agent 中调用。"}</p></div>
        <DemoSwitch checked={enabled} disabled={locked} label={`启用 ${skill.name}`} onChange={(next) => { setEnabled(next); touch(); }} />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">使用范围</p>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <SegmentedControl label="使用范围">
            {scopes.map((item) => <Segment active={scope === item} disabled={locked} key={item} onClick={() => { setScope(item); touch(); }}>{item}</Segment>)}
          </SegmentedControl>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">权限</p>
        <ul className="border-t border-border/14">
          {skill.permissions.map((permission) => (
            <li className="flex items-center justify-between gap-4 border-b border-border/14 py-3 text-sm" key={permission}>
              <span>{permission}</span>
              <DemoSwitch checked={granted[permission]} disabled={locked} label={`授予：${permission}`} onChange={(next) => { setGranted((value) => ({ ...value, [permission]: next })); touch(); }} />
            </li>
          ))}
        </ul>
      </div>
      <p aria-live="polite" className="rounded-control border border-dashed border-foreground/18 px-3 py-2.5 text-caption">{touched ? "演示预览：设置只在本页切换，不会保存或影响任何账户。" : "演示预览：这里展示未来的管理方式，修改不会保存。"}</p>
    </div>
  );
}
