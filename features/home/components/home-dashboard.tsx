"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Brain, History, Image, MessageSquareText, PenLine, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";

const capabilities = [
  { title: "私人人格", description: "创建拥有独立身份、语气与头像的助手。", href: "/personas", icon: Sparkles, tone: "secondary" },
  { title: "长期记忆", description: "查看、修改或关闭 AI 为你整理的内容。", href: "/memories", icon: Brain, tone: "primary" },
  { title: "文本工具", description: "总结、改写与翻译，独立于聊天和记忆。", href: "/tools", icon: PenLine, tone: "neutral" },
  { title: "图片理解", description: "安全上传图片，描述内容或回答相关问题。", href: "/tools/image", icon: Image, tone: "info" },
] as const;

export function HomeDashboard({ displayName }: { displayName?: string }) {
  const reduceMotion = useReducedMotion(); const transition = reduceMotion ? { duration: 0 } : { duration: .24, ease: "easeOut" as const };
  return <div className="space-y-12 lg:space-y-16">
    <motion.section animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-display border border-border bg-surface-raised px-5 py-8 shadow-soft sm:px-8 sm:py-10 lg:px-12 lg:py-14" initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} transition={transition}>
      <div aria-hidden="true" className="surface-grid absolute inset-y-0 right-0 hidden w-[42%] opacity-50 [mask-image:linear-gradient(to_left,black,transparent)] lg:block" />
      <div className="relative max-w-3xl"><Badge variant="neutral">私人 · 安静 · 可掌控</Badge><p className="mt-6 text-label text-primary">{displayName ? `${displayName}，欢迎回来` : "欢迎来到你的私人工作空间"}</p><h1 className="mt-3 text-display text-balance">把对话、助手与工具，<span className="text-primary">放在一个安静的地方。</span></h1><p className="mt-6 max-w-2xl text-body text-muted-foreground sm:text-base">和 AI 持续对话，创建熟悉的私人助手，让重要偏好在你的掌控下被记住；需要专注处理内容时，也可以使用完全独立的工具。</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg"><Link href="/chat"><MessageSquareText className="size-4" />新建对话<ArrowRight className="size-4" /></Link></Button><Button asChild size="lg" variant="outline"><Link href="/personas">选择或创建助手</Link></Button></div></div>
    </motion.section>

    <section aria-labelledby="start-title"><SectionHeader description="高频入口优先展示，所有内容都来自你实际启用的功能。" id="start-title" title="从这里开始" /><div className="mt-5 grid gap-4 lg:grid-cols-[1.35fr_.85fr]">
      <Link className="group rounded-display border border-primary/20 bg-primary-subtle/60 p-6 transition-[border-color,transform] duration-fast hover:-translate-y-0.5 hover:border-primary/40 sm:p-8" href="/chat"><span className="grid size-12 place-items-center rounded-card bg-primary text-primary-foreground"><MessageSquareText className="size-5" /></span><h2 className="mt-8 text-section-title">继续一次有上下文的对话</h2><p className="mt-2 max-w-xl text-supporting">使用默认助手，或在开始前选择一个私人 AI 人格。聊天记录与独立工具互不混合。</p><span className="mt-6 inline-flex items-center gap-1.5 text-label text-primary">打开聊天<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span></Link>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><Link className="group rounded-card border bg-surface-raised p-5 transition-colors duration-fast hover:border-primary/35" href="/tools"><Wrench className="size-5 text-primary" /><h2 className="mt-5 text-card-title">使用独立工具</h2><p className="mt-2 text-supporting">处理文本或图片，不创建对话，也不写入长期记忆。</p><span className="mt-4 inline-flex items-center gap-1 text-label text-primary">打开工具中心<ArrowRight className="size-3.5" /></span></Link><Link className="group rounded-card border bg-surface-raised p-5 transition-colors duration-fast hover:border-primary/35" href="/tools/history"><History className="size-5 text-primary" /><h2 className="mt-5 text-card-title">查看工具历史</h2><p className="mt-2 text-supporting">回到已保存的处理结果，或再次使用相同选项。</p><span className="mt-4 inline-flex items-center gap-1 text-label text-primary">查看记录<ArrowRight className="size-3.5" /></span></Link></div>
    </div></section>

    <section aria-labelledby="capabilities-title"><SectionHeader description="每项能力有清晰边界，不会为了便利把不同数据混在一起。" id="capabilities-title" title="构建你的 AI 工作空间" /><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{capabilities.map((item, index) => <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }} key={item.title} transition={{ ...transition, delay: reduceMotion ? 0 : index * .04 }} viewport={{ once: true }} whileInView={{ opacity: 1, y: 0 }}><Surface className="h-full p-5" variant="interactive"><Link className="block h-full" href={item.href}><span className="grid size-10 place-items-center rounded-control bg-surface-subtle text-primary"><item.icon className="size-[1.1rem]" /></span><h3 className="mt-5 text-card-title">{item.title}</h3><p className="mt-2 text-supporting">{item.description}</p><span className="mt-5 inline-flex items-center gap-1 text-label text-primary">了解并使用<ArrowRight className="size-3.5" /></span></Link></Surface></motion.div>)}</div></section>

    <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6" variant="subtle"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-success-subtle text-success"><ShieldCheck className="size-5" /></span><div><h2 className="text-card-title">你的内容按用途彼此隔离</h2><p className="mt-1 text-supporting">人格只影响绑定的对话，长期记忆可随时管理，独立工具不会读取聊天、人格或记忆。所有记录只对当前账号可见。</p></div></Surface>
  </div>;
}
