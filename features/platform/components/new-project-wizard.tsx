"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, Lock } from "lucide-react";

import { DemoNotice, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { categoryLabels, integrationMeta, visibilityMeta } from "@/features/platform/labels";
import { buildManifest, MANIFEST_CAPABILITIES, MANIFEST_CATEGORIES, slugify, validateManifest } from "@/features/platform/manifest";
import type { IntegrationMode, ProjectCategory, Visibility } from "@/features/platform/types";
import { cn } from "@/lib/utils";

const steps = ["基本信息", "可见性", "能力与接入", "检查与创建"] as const;

const capabilityLabels: Record<(typeof MANIFEST_CAPABILITIES)[number], { label: string; detail: string }> = {
  "documentation.read": { label: "文档阅读", detail: "随版本封存的 Markdown 文档" },
  "presentation.read": { label: "成果展示", detail: "概览、架构、基准等展示区块" },
  "static-image.read": { label: "静态图片", detail: "经审核批准的图片资产" },
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "00000000-0000-4000-8000-000000000000";
}

const field = "premium-field h-11 px-4 text-sm";

export function NewProjectWizard({ base }: { base: string }) {
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState("00000000-0000-4000-8000-000000000000");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState<ProjectCategory>("research");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [capabilities, setCapabilities] = useState<string[]>(["documentation.read", "presentation.read"]);
  const [copied, setCopied] = useState(false);

  useEffect(() => setProjectId(newId()), []);
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const manifest = useMemo(() => buildManifest({ projectId, slug, name, summary, category, visibility, capabilities }), [projectId, slug, name, summary, category, visibility, capabilities]);
  const result = useMemo(() => validateManifest(manifest), [manifest]);
  const errors = result.issues.filter((issue) => issue.level === "error");
  const warnings = result.issues.filter((issue) => issue.level === "warning");
  const stepErrors = [
    errors.filter((issue) => ["name", "slug", "summary", "category"].includes(issue.path)),
    errors.filter((issue) => issue.path === "visibility"),
    errors.filter((issue) => issue.path.startsWith("capabilities") || issue.path.startsWith("integration")),
    errors,
  ];
  const canNext = stepErrors[step].length === 0;

  const toggleCapability = (id: string) => setCapabilities((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(manifest);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pb-6">
      <Link className="group mb-6 inline-flex items-center gap-1.5 text-[.8125rem] text-muted-foreground hover:text-foreground" href={base} prefetch={false}>
        <ArrowLeft aria-hidden="true" className="size-3.5" /><span className="link-grow">全部项目</span>
      </Link>
      <header className="max-w-[48rem]">
        <p className="kicker">新建项目<span aria-hidden="true" className="kicker__arrow">↓</span></p>
        <h1 className="mt-4 text-[clamp(2.2rem,4.4vw,3.75rem)] font-medium leading-[1.05] tracking-[-.04em]"><span className="title-line"><span>四步，得到一份</span></span><span className="title-line" style={delay(90)}><span>合格的项目草稿。</span></span></h1>
      </header>
      <DemoNotice className="mt-8">Registry 尚未部署：向导会生成并校验真实格式的 Manifest（P0.5 · 0.5.0），但「创建草稿」不会保存。你可以复制 Manifest 带去开发者控制台。</DemoNotice>

      <ol aria-label="步骤" className="mt-10 grid grid-cols-4 gap-1.5">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              aria-current={index === step ? "step" : undefined}
              className={cn("w-full text-left disabled:cursor-not-allowed")}
              disabled={index > step && !canNext}
              onClick={() => setStep(index)}
              type="button"
            >
              <span className={cn("block h-1 rounded-full transition-colors duration-500", index <= step ? "bg-foreground" : "bg-foreground/12")} />
              <span className={cn("mt-2 flex items-center gap-1.5 text-[.75rem] font-medium", index === step ? "text-foreground" : "text-muted-foreground")}>
                <span className="font-code tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span className="max-[520px]:sr-only">{label}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-10 min-[1024px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {step === 0 ? (
            <div className="space-y-6">
              <div>
                <label className="text-[.8125rem] font-medium" htmlFor="np-name">项目名称</label>
                <input className={cn(field, "mt-2")} id="np-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：排序算法对照实验" value={name} />
              </div>
              <div>
                <label className="text-[.8125rem] font-medium" htmlFor="np-slug">Slug</label>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-code text-sm text-muted-foreground">/explore/</span>
                  <input className={cn(field, "font-code")} id="np-slug" maxLength={63} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value.toLowerCase()); }} placeholder="sorting-lab" value={slug} />
                </div>
                <p className="mt-1.5 text-[.75rem] text-muted-foreground">小写字母开头，只含小写字母、数字和连字符。slug 一经创建永不复用。中文名称需要手动填写。</p>
              </div>
              <div>
                <label className="text-[.8125rem] font-medium" htmlFor="np-category">类别</label>
                <select className={cn(field, "mt-2")} id="np-category" onChange={(event) => setCategory(event.target.value as ProjectCategory)} value={category}>
                  {MANIFEST_CATEGORIES.map((key) => <option key={key} value={key}>{categoryLabels[key]} · {key}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[.8125rem] font-medium" htmlFor="np-summary">一句话摘要</label>
                <textarea className="premium-field mt-2 min-h-[6.5rem] resize-y px-4 py-3 text-sm leading-6" id="np-summary" maxLength={500} onChange={(event) => setSummary(event.target.value)} placeholder="这个项目解决什么问题，访客能在页面上看到什么。" value={summary} />
                <p className="mt-1.5 text-right text-[.6875rem] tabular-nums text-muted-foreground">{summary.length} / 500</p>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <fieldset>
              <legend className="text-[.8125rem] font-medium">谁能看见这个项目？</legend>
              <div className="mt-4 grid gap-0.5">
                {(["PRIVATE", "UNLISTED", "PUBLIC"] as Visibility[]).map((key) => (
                  <label className={cn("flex cursor-pointer items-start gap-4 rounded-card p-5 transition-colors duration-300", visibility === key ? "bg-foreground text-background" : "bg-surface hover:bg-surface-muted")} key={key}>
                    <input checked={visibility === key} className="mt-1 size-4 accent-[hsl(var(--lime))]" name="np-visibility" onChange={() => setVisibility(key)} type="radio" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-base font-medium">{visibilityMeta[key].label}<span className={cn("font-code text-[.6875rem]", visibility === key ? "text-background/60" : "text-muted-foreground")}>{key}</span></span>
                      <span className={cn("mt-1 block text-[.8125rem] leading-5", visibility === key ? "text-background/75" : "text-muted-foreground")}>{visibilityMeta[key].detail}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-4 flex items-start gap-2 text-[.75rem] leading-5 text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />新项目默认私有。改为公开前，草稿需要通过独立审核，所有公开资产必须已批准。</p>
            </fieldset>
          ) : null}

          {step === 2 ? (
            <div className="space-y-10">
              <fieldset>
                <legend className="text-[.8125rem] font-medium">接入方式</legend>
                <div className="mt-4 grid gap-0.5 min-[640px]:grid-cols-3">
                  {(Object.keys(integrationMeta) as IntegrationMode[]).map((key) => {
                    const open = key === "SHOWCASE";
                    return (
                      <div className={cn("flex min-h-[9.5rem] flex-col rounded-card p-4", open ? "bg-foreground text-background" : "demo-outline text-muted-foreground")} key={key}>
                        <span className="flex items-center justify-between gap-2"><span className="font-code text-[.75rem]">{integrationMeta[key].level}</span>{open ? <Check aria-hidden="true" className="size-4 text-lime" /> : <span className="text-[.625rem]">尚未开放</span>}</span>
                        <span className={cn("mt-auto pt-6 text-sm font-medium", open ? "text-background" : "text-foreground")}>{integrationMeta[key].label}</span>
                        <span className={cn("mt-1 text-[.75rem] leading-5", open ? "text-background/70" : "")}>{integrationMeta[key].detail}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[.75rem] leading-5 text-muted-foreground">P0.5 契约只接受展示型接入（SHOWCASE）。受控嵌入与远程 API 需要沙箱、网关与授权完成安全验收后再开放。</p>
              </fieldset>
              <fieldset>
                <legend className="text-[.8125rem] font-medium">声明能力 <span className="font-normal text-muted-foreground">（1–3 项）</span></legend>
                <div className="mt-4 grid gap-0.5">
                  {MANIFEST_CAPABILITIES.map((id) => (
                    <label className="flex cursor-pointer items-center gap-4 rounded-card bg-surface p-4 transition-colors duration-300 hover:bg-surface-muted" key={id}>
                      <input checked={capabilities.includes(id)} className="size-4 accent-[hsl(var(--foreground))]" onChange={() => toggleCapability(id)} type="checkbox" />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{capabilityLabels[id].label}</span><span className="block text-[.75rem] text-muted-foreground">{capabilityLabels[id].detail}</span></span>
                      <span className="font-code text-[.6875rem] text-muted-foreground max-[520px]:hidden">{id}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <dl className="border-t border-border/12">
                {[
                  ["名称", name || "—"],
                  ["Slug", slug ? `/${slug}` : "—"],
                  ["类别", categoryLabels[category]],
                  ["可见性", visibilityMeta[visibility].label],
                  ["接入", `${integrationMeta.SHOWCASE.level} · ${integrationMeta.SHOWCASE.label}`],
                  ["能力", capabilities.join(", ") || "—"],
                  ["初始版本", "0.1.0 · 草稿"],
                ].map(([label, value]) => (
                  <div className="spec-row" key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-right text-[.8125rem] font-medium">{value}</dd></div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled>创建草稿</Button>
                <span className="text-[.75rem] text-muted-foreground">{errors.length ? `还有 ${errors.length} 个问题需要修正。` : "Manifest 已通过校验。演示状态：Registry 部署后才能创建。"}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-10 flex items-center justify-between gap-3 border-t border-border/10 pt-6">
            <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} variant="ghost"><ArrowLeft className="size-4" />上一步</Button>
            {step < steps.length - 1 ? <Button disabled={!canNext} onClick={() => setStep((current) => current + 1)}>下一步<ArrowRight className="size-4" /></Button> : null}
          </div>
          {!canNext && step < steps.length - 1 ? <p className="mt-3 text-right text-[.75rem] text-muted-foreground">{stepErrors[step][0]?.path}：{stepErrors[step][0]?.message}</p> : null}
        </div>

        <aside aria-label="Manifest 预览" className="min-w-0 min-[1024px]:sticky min-[1024px]:top-[calc(var(--shell-header-height)+1.5rem)] min-[1024px]:self-start">
          <div className="overflow-hidden rounded-card bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
            <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--paper)/.12)] px-4 py-3">
              <span className="font-code text-[.75rem] text-[hsl(var(--paper)/.7)]">manifest.json · 0.5.0</span>
              <button className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[.75rem] text-[hsl(var(--paper)/.8)] transition-colors hover:bg-[hsl(var(--paper)/.1)] hover:text-[hsl(var(--paper))]" onClick={copy} type="button">
                {copied ? <Check aria-hidden="true" className="size-3.5 text-lime" /> : <Copy aria-hidden="true" className="size-3.5" />}{copied ? "已复制" : "复制"}
              </button>
            </div>
            <pre className="premium-scrollbar max-h-[26rem] overflow-auto p-4 font-code text-[.75rem] leading-[1.7]"><code>{manifest}</code></pre>
          </div>
          <div className="mt-3 rounded-card bg-surface p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">实时校验</p>
              <ToneBadge dot tone={result.ok ? "success" : "danger"}>{result.ok ? "通过" : `${errors.length} 个错误`}</ToneBadge>
            </div>
            <ul className="mt-3 space-y-2">
              {[...errors, ...warnings].slice(0, 6).map((issue, index) => (
                <li className="flex gap-2 text-[.75rem] leading-5" key={`${issue.path}-${index}`}>
                  <span aria-hidden="true" className={cn("mt-[.4rem] size-1.5 shrink-0 rounded-full", issue.level === "error" ? "bg-destructive" : "bg-warning")} />
                  <span><span className="font-code">{issue.path}</span> <span className="text-muted-foreground">{issue.message}</span></span>
                </li>
              ))}
              {result.ok && !warnings.length ? <li className="text-[.75rem] text-muted-foreground">所有字段符合 P0.5 契约。projectId 在真实流程中由平台分配，这里由浏览器临时生成。</li> : null}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
