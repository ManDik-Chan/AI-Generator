"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarPicker } from "@/features/persona/components/avatar-picker";
import { PersonaPreview } from "@/features/persona/components/persona-preview";
import { PERSONA_LIMITS } from "@/features/persona/constants";
import { createPersonaAction, updatePersonaAction } from "@/features/persona/actions";
import type { PersonaInput, PersonaView } from "@/features/persona/types";

const fields = [
  ["description", "简介", PERSONA_LIMITS.description, "一句话说明这个人格适合做什么"],
  ["identity", "身份设定", PERSONA_LIMITS.identity, "例如：一位重视证据的历史研究员"],
  ["personality", "性格 *", PERSONA_LIMITS.personality, "例如：温和、严谨、富有好奇心"],
  ["speakingStyle", "说话方式", PERSONA_LIMITS.speakingStyle, "例如：先给结论，再列证据"],
  ["expertise", "擅长领域", PERSONA_LIMITS.expertise, "例如：中国史、文献分析"],
  ["greeting", "开场白", PERSONA_LIMITS.greeting, "只显示在空聊天页，不会写入消息或上下文"],
  ["systemPrompt", "高级补充指令", PERSONA_LIMITS.systemPrompt, "留空时系统会根据上方字段自动构建"],
  ["avatarPrompt", "头像提示词", PERSONA_LIMITS.avatarPrompt, "描述主体、风格、表情、服装、背景和构图"],
] as const;

export function PersonaForm({ initial, draft }: { initial?: PersonaView; draft?: PersonaInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const seed = initial ?? draft;
  const currentAiAvatar = Boolean(initial?.avatarUrl?.startsWith("/api/personas/"));
  const [value, setValue] = useState<PersonaInput>({ name: seed?.name ?? "", avatarUrl: currentAiAvatar ? undefined : seed?.avatarUrl ?? "/personas/avatar-1.svg", avatarChoice: currentAiAvatar ? "keep-current" : "preset", avatarPrompt: seed?.avatarPrompt ?? "", description: seed?.description ?? "", identity: seed?.identity ?? "", personality: seed?.personality ?? "", speakingStyle: seed?.speakingStyle ?? "", expertise: seed?.expertise ?? "", greeting: seed?.greeting ?? "", systemPrompt: seed?.systemPrompt ?? "" });

  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty]);
  function change(field: keyof PersonaInput, next: string) { setDirty(true); setValue((current) => ({ ...current, [field]: next })); }

  return (
    <div>
      <div aria-label="编辑与预览" className="mb-4 grid grid-cols-2 rounded-control bg-surface-muted p-1 lg:hidden" role="tablist">
        <button aria-selected={mobileView === "form"} className={mobileView === "form" ? "flex min-h-11 items-center justify-center gap-2 rounded-[.65rem] bg-surface-raised text-sm font-semibold shadow-soft" : "flex min-h-11 items-center justify-center gap-2 rounded-[.65rem] text-sm text-muted-foreground"} onClick={() => setMobileView("form")} role="tab" type="button"><ListChecks className="size-4" />编辑内容</button>
        <button aria-selected={mobileView === "preview"} className={mobileView === "preview" ? "flex min-h-11 items-center justify-center gap-2 rounded-[.65rem] bg-surface-raised text-sm font-semibold shadow-soft" : "flex min-h-11 items-center justify-center gap-2 rounded-[.65rem] text-sm text-muted-foreground"} onClick={() => setMobileView("preview")} role="tab" type="button"><Eye className="size-4" />实时预览</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form className={`${mobileView === "preview" ? "hidden lg:block" : "block"} premium-panel min-w-0 space-y-5 p-4 sm:p-6`} onSubmit={(event) => { event.preventDefault(); setError(undefined); startTransition(async () => { const result = initial ? await updatePersonaAction(initial.id, value) : await createPersonaAction(value); if (!result.success) { setError(result.message); setFieldErrors(result.fieldErrors ?? {}); return; } setDirty(false); router.push(`/personas/${result.id}?saved=1`); }); }}>
        {error && <p className="rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground" role="alert">{error}</p>}
        <div className="border-b border-border/10 pb-3"><p className="premium-kicker">01 · BASIC IDENTITY</p><h2 className="mt-1 text-lg font-semibold">基本身份与头像</h2></div>
        <div><label className="text-sm font-medium" htmlFor="persona-name">名称 *</label><input aria-describedby={fieldErrors.name ? "persona-name-error" : undefined} className="premium-field mt-2 h-11 px-3 text-sm" id="persona-name" maxLength={PERSONA_LIMITS.name} onChange={(event) => change("name", event.target.value)} value={value.name} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span id="persona-name-error" className="text-destructive-foreground">{fieldErrors.name?.[0]}</span><span>{value.name.length}/{PERSONA_LIMITS.name}</span></div></div>
        {currentAiAvatar && value.avatarChoice === "keep-current" && <div className="premium-subpanel p-3 text-sm">当前使用 AI 头像。选择下方预设头像才会切换。</div>}<AvatarPicker onChange={(avatar) => { change("avatarUrl", avatar); change("avatarChoice", "preset"); }} value={value.avatarUrl} />
        {fields.map(([field, label, limit, placeholder]) => <Fragment key={field}>{field === "personality" && <div className="border-b border-border/10 pb-3 pt-3"><p className="premium-kicker">02 · VOICE</p><h2 className="mt-1 text-lg font-semibold">性格与表达</h2></div>}{field === "expertise" && <div className="border-b border-border/10 pb-3 pt-3"><p className="premium-kicker">03 · CAPABILITY</p><h2 className="mt-1 text-lg font-semibold">专长与欢迎语</h2></div>}{field === "systemPrompt" && <div className="border-b border-border/10 pb-3 pt-3"><p className="premium-kicker">04 · ADVANCED</p><h2 className="mt-1 text-lg font-semibold">高级边界</h2></div>}<div><label className="text-sm font-medium" htmlFor={`persona-${field}`}>{label}</label><textarea aria-describedby={fieldErrors[field] ? `persona-${field}-error` : undefined} className="premium-field mt-2 min-h-24 resize-y p-3 text-sm leading-6" id={`persona-${field}`} maxLength={limit} onChange={(event) => change(field, event.target.value)} placeholder={placeholder} value={value[field] ?? ""} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span className="text-destructive-foreground" id={`persona-${field}-error`}>{fieldErrors[field]?.[0]}</span><span>{(value[field] ?? "").length}/{limit}</span></div></div></Fragment>)}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button disabled={pending} onClick={() => { if (!dirty || window.confirm("放弃未保存的修改？")) router.push(initial ? `/personas/${initial.id}` : "/personas"); }} type="button" variant="outline">取消</Button><Button disabled={pending} type="submit">{pending ? "正在保存…" : initial ? "保存修改" : "创建人格"}</Button></div>
      </form>
      <div className={mobileView === "form" ? "hidden lg:block" : "block"}><PersonaPreview persona={value} /></div>
      </div>
    </div>
  );
}
