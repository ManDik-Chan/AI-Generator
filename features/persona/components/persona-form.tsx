"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
] as const;

export function PersonaForm({ initial, draft }: { initial?: PersonaView; draft?: PersonaInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const seed = initial ?? draft;
  const [value, setValue] = useState<PersonaInput>({ name: seed?.name ?? "", avatarUrl: seed?.avatarUrl ?? "/personas/avatar-1.svg", description: seed?.description ?? "", identity: seed?.identity ?? "", personality: seed?.personality ?? "", speakingStyle: seed?.speakingStyle ?? "", expertise: seed?.expertise ?? "", greeting: seed?.greeting ?? "", systemPrompt: seed?.systemPrompt ?? "" });

  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [dirty]);
  function change(field: keyof PersonaInput, next: string) { setDirty(true); setValue((current) => ({ ...current, [field]: next })); }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form className="min-w-0 space-y-5 rounded-2xl border bg-card p-4 sm:p-6" onSubmit={(event) => { event.preventDefault(); setError(undefined); startTransition(async () => { const result = initial ? await updatePersonaAction(initial.id, value) : await createPersonaAction(value); if (!result.success) { setError(result.message); setFieldErrors(result.fieldErrors ?? {}); return; } setDirty(false); router.push(`/personas/${result.id}?saved=1`); router.refresh(); }); }}>
        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
        <div><label className="text-sm font-medium" htmlFor="persona-name">名称 *</label><input aria-describedby={fieldErrors.name ? "persona-name-error" : undefined} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm" id="persona-name" maxLength={PERSONA_LIMITS.name} onChange={(event) => change("name", event.target.value)} value={value.name} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span id="persona-name-error" className="text-red-600">{fieldErrors.name?.[0]}</span><span>{value.name.length}/{PERSONA_LIMITS.name}</span></div></div>
        <AvatarPicker onChange={(avatar) => change("avatarUrl", avatar)} value={value.avatarUrl} />
        {fields.map(([field, label, limit, placeholder]) => <div key={field}><label className="text-sm font-medium" htmlFor={`persona-${field}`}>{label}</label><textarea aria-describedby={fieldErrors[field] ? `persona-${field}-error` : undefined} className="mt-2 min-h-24 w-full resize-y rounded-xl border bg-background p-3 text-sm" id={`persona-${field}`} maxLength={limit} onChange={(event) => change(field, event.target.value)} placeholder={placeholder} value={value[field] ?? ""} /><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span className="text-red-600" id={`persona-${field}-error`}>{fieldErrors[field]?.[0]}</span><span>{(value[field] ?? "").length}/{limit}</span></div></div>)}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button disabled={pending} onClick={() => { if (!dirty || window.confirm("放弃未保存的修改？")) router.push(initial ? `/personas/${initial.id}` : "/personas"); }} type="button" variant="outline">取消</Button><Button disabled={pending} type="submit">{pending ? "正在保存…" : initial ? "保存修改" : "创建人格"}</Button></div>
      </form>
      <PersonaPreview persona={value} />
    </div>
  );
}
