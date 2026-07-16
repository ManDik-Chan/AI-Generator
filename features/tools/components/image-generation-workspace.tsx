"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, ImageIcon, ImageOff, LoaderCircle, RotateCcw, Sparkles, Square, Trash2 } from "lucide-react";

import { GenerationProgress, type GenerationStage } from "@/components/ai/generation-progress";
import { useElapsedTime } from "@/components/ai/use-elapsed-time";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { formatVisionUsage } from "@/features/tools/image/usage-display";
import { IMAGE_GENERATION_PROMPT_MAX_CHARS, IMAGE_GENERATION_STYLES, type ImageGenerationStyle } from "@/features/tools/image-generation/constants";
import { consumeImageGenerationDraft } from "@/features/tools/image-generation/draft";
import type { GeneratedToolImageDto, ImageGenerationUsageDto } from "@/features/tools/image-generation/types";
import { readSseEvents } from "@/lib/ai/read-sse";

type RunState = "idle" | "running" | "complete" | "cancelled" | "error";
interface Props { configured: boolean; imageSize: string; initialUsage: ImageGenerationUsageDto; initialHistory: GeneratedToolImageDto[]; initialPage: number; initialPages: number }
interface RunEvent { runId: string; usage: ImageGenerationUsageDto }
interface ProgressEvent { stage: string }
interface DoneEvent { image: GeneratedToolImageDto; usage: ImageGenerationUsageDto }
interface ErrorEvent { message?: string }

const progressStages: GenerationStage[] = [
  { id: "preparing", label: "准备创作参数", detail: "验证描述、风格和服务端图片尺寸。" },
  { id: "generating", label: "AI 正在生成图片", detail: "本次运行只会请求一张图片。" },
  { id: "downloading", label: "下载生成结果", detail: "从模型临时地址获取图片。" },
  { id: "validating", label: "安全检查", detail: "验证地址、格式、大小与图片签名。" },
  { id: "uploading", label: "保存到私有空间", detail: "上传到当前用户的私有 Storage。" },
  { id: "saving", label: "保存生成记录", detail: "确认任务终态并写入私有历史。" },
];

export function ImageGenerationWorkspace({ configured, imageSize, initialUsage, initialHistory, initialPage, initialPages }: Props) {
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const requestVersionRef = useRef(0);
  const userHasEditedRef = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageGenerationStyle>("AUTO");
  const [usage, setUsage] = useState(initialUsage);
  const [history, setHistory] = useState(initialHistory);
  const [current, setCurrent] = useState<GeneratedToolImageDto>();
  const [state, setState] = useState<RunState>("idle");
  const [activeStage, setActiveStage] = useState("preparing");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GeneratedToolImageDto>();
  const elapsed = useElapsedTime(state === "running");

  useEffect(() => {
    const draft = consumeImageGenerationDraft(sessionStorage);
    if (draft && !userHasEditedRef.current) {
      setPrompt(draft.prompt);
      setStyle(draft.style);
    }
    return () => {
      requestVersionRef.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  async function generate() {
    const cleanPrompt = prompt.trim();
    if (!configured || !cleanPrompt || state === "running") return;
    const version = ++requestVersionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("running");
    setActiveStage("preparing");
    setError("");
    setCurrent(undefined);
    try {
      let terminal = false;
      const response = await fetch("/api/tools/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, style }),
        signal: controller.signal,
      });
      await readSseEvents(response, (event, raw) => {
        if (version !== requestVersionRef.current) return;
        if (event === "run") setUsage((raw as RunEvent).usage);
        if (event === "progress") setActiveStage((raw as ProgressEvent).stage);
        if (event === "done") {
          terminal = true;
          const data = raw as DoneEvent;
          setCurrent(data.image);
          setUsage(data.usage);
          setHistory((items) => [data.image, ...items.filter((item) => item.id !== data.image.id)]);
          setState("complete");
        }
        if (event === "cancelled") { terminal = true; setState("cancelled"); setError("图片生成已停止，没有保存半成品。"); }
        if (event === "error") { terminal = true; setState("error"); setError((raw as ErrorEvent).message || "图片生成失败，请稍后重试。"); }
      });
      if (!terminal && version === requestVersionRef.current) {
        setState("error");
        setError("图片生成连接提前结束，请重试。");
      }
    } catch (caught) {
      if (version !== requestVersionRef.current) return;
      if (controller.signal.aborted) { setState("cancelled"); setError("图片生成已停止，没有保存半成品。"); }
      else { setState("error"); setError(caught instanceof Error ? caught.message : "图片生成失败，请稍后重试。"); }
    } finally {
      if (version === requestVersionRef.current) controllerRef.current = undefined;
    }
  }

  function stop() {
    if (state !== "running") return;
    requestVersionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = undefined;
    setState("cancelled");
    setError("图片生成已停止，没有保存半成品。");
  }

  async function removeImage(image: GeneratedToolImageDto) {
    const response = await fetch(`/api/generated-images/${image.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      setError(body?.message || body?.error || "删除图片失败，请稍后重试。");
      return;
    }
    setHistory((items) => items.filter((item) => item.id !== image.id));
    setCurrent((value) => value?.id === image.id ? undefined : value);
    setDeleteTarget(undefined);
  }

  const active = state === "running";
  const status = state === "complete" ? "生成完成" : state === "cancelled" ? "已停止" : state === "error" ? "生成失败" : active ? "正在生成" : "等待创作";

  return <div className="space-y-8">
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,.82fr)_minmax(24rem,1.18fr)]">
      <section className="premium-panel min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/10 pb-4">
          <div><p className="premium-kicker">CREATE ONE IMAGE</p><h2 className="mt-1 text-section-title">描述你的画面</h2></div>
          <span className="premium-chip text-right">{formatVisionUsage(usage)}</span>
        </div>
        <label className="mt-5 grid gap-2">
          <span className="text-sm font-medium">图片描述</span>
          <textarea className="premium-field min-h-36 resize-y p-3 leading-6" disabled={active || !configured} maxLength={IMAGE_GENERATION_PROMPT_MAX_CHARS} onChange={(event) => { userHasEditedRef.current = true; setPrompt(event.target.value); }} placeholder="例如：雨后的未来城市街道，霓虹灯倒映在路面，电影感广角构图" value={prompt} />
          <span className="text-right text-xs text-muted-foreground">{prompt.length} / {IMAGE_GENERATION_PROMPT_MAX_CHARS}</span>
        </label>
        <label className="mt-4 grid gap-2">
          <span className="text-sm font-medium">创作风格</span>
          <select className="premium-field h-11 min-w-0 px-3" disabled={active || !configured} onChange={(event) => { userHasEditedRef.current = true; setStyle(event.target.value as ImageGenerationStyle); }} value={style}>
            {Object.entries(IMAGE_GENERATION_STYLES).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
          </select>
        </label>
        <div className="premium-subpanel mt-4 grid gap-2 p-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
          <span>每次点击只生成 1 张</span><span>服务端尺寸：{imageSize}</span><span>结果保存在私有空间</span><span>描述不会获得系统指令权限</span>
        </div>
        {error && <p className="mt-4 rounded-control bg-destructive-subtle p-3 text-sm text-destructive-foreground" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/10 pt-4">
          {active ? <Button onClick={stop} variant="outline"><Square className="size-4 fill-current" />停止生成</Button> : <Button disabled={!configured || !prompt.trim()} onClick={() => void generate()}><Sparkles className="size-4" />开始生成</Button>}
          <span className="premium-chip">{status}</span>
        </div>
      </section>

      <section className="premium-panel-strong min-w-0 p-4 sm:p-6">
        {active ? <GenerationProgress activeStage={activeStage} elapsedSeconds={elapsed} onCancel={stop} stages={progressStages} title="正在创作并安全保存图片" /> : current ? <GeneratedImagePanel image={current} onDelete={() => setDeleteTarget(current)} onError={setError} onReuse={() => { userHasEditedRef.current = true; setPrompt(current.prompt); setStyle(current.style); }} /> : <div className="grid min-h-[28rem] place-items-center rounded-overlay border border-dashed border-border/20 bg-surface-muted/55 p-6 text-center"><div><span className="premium-icon-tile mx-auto size-16 rounded-[1.3rem]"><ImageIcon className="size-7" /></span><h2 className="mt-4 text-section-title">生成结果将在这里显示</h2><p className="mx-auto mt-2 max-w-sm text-supporting">输入描述不会自动产生费用；只有点击“开始生成”后才会创建一次图片运行。</p></div></div>}
      </section>
    </div>

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="premium-kicker">PRIVATE GALLERY</p><h2 className="mt-1 text-section-title">我的生成图片</h2><p className="mt-1 text-supporting">预览与下载都通过登录态鉴权，不保存公开 URL 或 signed URL。</p></div><Button asChild variant="outline"><Link href="/tools/history?type=IMAGE_GENERATE">查看运行历史</Link></Button></div>
      {history.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{history.map((image) => <GeneratedImageCard image={image} key={image.id} onDelete={() => setDeleteTarget(image)} onError={setError} onReuse={() => { userHasEditedRef.current = true; setPrompt(image.prompt); setStyle(image.style); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div> : <EmptyState description="完成第一张图片后，它会显示在当前用户的私有画廊中。" icon={<ImageIcon className="size-6" />} title="还没有生成图片" />}
      <div className="flex items-center justify-between gap-3"><Button asChild className={initialPage <= 1 ? "pointer-events-none opacity-50" : ""} variant="outline"><Link href={`/tools/image-generate?page=${Math.max(1, initialPage - 1)}`}>上一页</Link></Button><span className="premium-chip">第 {initialPage} / {initialPages} 页</span><Button asChild className={initialPage >= initialPages ? "pointer-events-none opacity-50" : ""} variant="outline"><Link href={`/tools/image-generate?page=${Math.min(initialPages, initialPage + 1)}`}>下一页</Link></Button></div>
    </section>

    <ConfirmDialog confirmAction={<Button onClick={() => deleteTarget && void removeImage(deleteTarget)} variant="destructive"><Trash2 className="size-4" />确认删除</Button>} description="图片文件与对应工具运行记录会一并删除，此操作无法撤销。" onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} open={Boolean(deleteTarget)} title="删除这张生成图片？"><p className="text-sm text-muted-foreground">不会影响聊天、人格、长期记忆或其他工具记录。</p></ConfirmDialog>
  </div>;
}

function imageSizeLabel(image: GeneratedToolImageDto) {
  return image.width && image.height ? `${image.width} × ${image.height}` : "尺寸未知";
}

function imageMetadata(image: GeneratedToolImageDto) {
  return `${IMAGE_GENERATION_STYLES[image.style].label} · ${imageSizeLabel(image)} · ${new Date(image.createdAt).toLocaleString("zh-CN")}`;
}

function GeneratedImagePanel({ image, onDelete, onError, onReuse }: { image: GeneratedToolImageDto; onDelete(): void; onError(message: string): void; onReuse(): void }) {
  return <div><GeneratedImagePreview image={image} priority variant="contain" /><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="premium-kicker">LATEST RESULT</p><p className="mt-1 break-words text-sm leading-6">{image.prompt}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{imageMetadata(image)}</p><p className="mt-1 text-xs text-muted-foreground">私有图片 · 仅当前账号可预览与下载</p></div><ImageActions image={image} onDelete={onDelete} onError={onError} onReuse={onReuse} /></div></div>;
}

function GeneratedImageCard({ image, onDelete, onError, onReuse }: { image: GeneratedToolImageDto; onDelete(): void; onError(message: string): void; onReuse(): void }) {
  return <article className="premium-panel min-w-0 overflow-hidden p-3"><GeneratedImagePreview image={image} variant="cover" /><p className="mt-3 line-clamp-2 break-words text-sm leading-5">{image.prompt}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{imageMetadata(image)}</p><div className="mt-3"><ImageActions image={image} onDelete={onDelete} onError={onError} onReuse={onReuse} /></div></article>;
}

function GeneratedImagePreview({ image, priority = false, variant }: { image: GeneratedToolImageDto; priority?: boolean; variant: "contain" | "cover" }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  return <div className={`relative mx-auto aspect-square overflow-hidden bg-surface-muted ${variant === "contain" ? "max-h-[36rem] rounded-overlay" : "rounded-control"}`}>
    {status === "loading" && <span className="absolute inset-0 grid place-items-center"><LoaderCircle className="size-6 animate-spin text-primary motion-reduce:animate-none" /></span>}
    {status === "error" ? <span className="absolute inset-0 grid place-items-center p-4 text-center text-muted-foreground"><span><ImageOff className="mx-auto size-7" /><span className="mt-2 block text-xs">图片暂时无法加载</span></span></span> : <Image alt={image.prompt} className={variant === "contain" ? "object-contain" : "object-cover"} fill onError={() => setStatus("error")} onLoad={() => setStatus("loaded")} priority={priority} src={image.previewUrl} unoptimized />}
  </div>;
}

function ImageActions({ image, onDelete, onError, onReuse }: { image: GeneratedToolImageDto; onDelete(): void; onError(message: string): void; onReuse(): void }) {
  const [copied, setCopied] = useState(false);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(feedbackTimerRef.current), []);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(image.prompt);
      setCopied(true);
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onError("复制描述失败，请手动选择描述文字。");
    }
  }
  return <div className="flex flex-wrap gap-2"><Button onClick={onReuse} size="sm" variant="outline"><RotateCcw className="size-3.5" />再次创作</Button><Button onClick={() => void copyPrompt()} size="sm" variant="ghost"><Copy className="size-3.5" />{copied ? "描述已复制" : "复制描述"}</Button><Button asChild size="sm" variant="ghost"><a download href={image.downloadUrl}><Download className="size-3.5" />下载</a></Button><Button aria-label="删除图片" className="text-destructive-foreground" onClick={onDelete} size="icon-sm" variant="ghost"><Trash2 className="size-3.5" /></Button></div>;
}
