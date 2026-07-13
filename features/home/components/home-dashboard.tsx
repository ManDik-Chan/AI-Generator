"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Brain,
  Image,
  MessageSquareText,
  PenLine,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/page-header";
import { getTimeGreeting } from "@/features/home/presentation";

export interface HomeConversationPreview {
  id: string;
  title: string;
  updatedAt: string;
  personaName?: string;
}

const studioCapabilities = [
  {
    number: "01",
    title: "私人助手",
    description: "为不同任务建立专属角色、语气与边界。",
    action: "进入工作区",
    href: "/personas",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "长期记忆",
    description: "查看、修正或关闭 AI 为你整理的重要偏好。",
    action: "管理记忆",
    href: "/memories",
    icon: Brain,
  },
  {
    number: "03",
    title: "文本工具",
    description: "总结、改写、翻译与结构化表达。",
    action: "打开工具",
    href: "/tools",
    icon: PenLine,
  },
  {
    number: "04",
    title: "图片理解",
    description: "从截图、图表与照片中提取关键信息。",
    action: "分析图片",
    href: "/tools/image",
    icon: Image,
  },
] as const;

function AiCoreVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative grid min-h-[13.5rem] place-items-center overflow-hidden min-[1024px]:min-h-full"
    >
      <div className="premium-aurora absolute -right-8 -top-20 size-72 rounded-full bg-[#80e2be] opacity-45 blur-[70px] dark:bg-primary/35" />
      <div className="premium-aurora absolute -bottom-24 left-0 size-56 rounded-full bg-[#c7b8ff] opacity-25 blur-[70px] dark:bg-[#7768b5]/20" />
      <div className="premium-orbit absolute size-[13.25rem] rounded-full border border-primary/30 min-[521px]:size-[16.5rem]" />
      <div className="premium-orbit-reverse absolute size-[16.5rem] rounded-full border border-dashed border-primary/20 min-[521px]:size-[22rem]" />
      <div className="premium-float relative z-10 flex size-[6.75rem] -rotate-3 flex-col items-center justify-center rounded-[2.125rem] bg-gradient-to-br from-foreground to-secondary text-background shadow-[0_35px_70px_hsl(var(--overlay)/.28),inset_0_1px_0_hsl(var(--background)/.2)] min-[521px]:size-[8.25rem] min-[521px]:rounded-[2.5rem]">
        <span className="text-[2.25rem] font-extrabold tracking-[-.08em] text-[#8ee0c3] min-[521px]:text-[2.625rem]">
          AI
        </span>
        <small className="mt-1 text-[.55rem] tracking-[.28em] opacity-70">
          READY
        </small>
      </div>
      <span className="premium-float absolute left-[8%] top-[22%] rounded-full border border-border/12 bg-surface-raised/85 px-3 py-2 text-[.6875rem] font-bold shadow-soft backdrop-blur-md">
        记忆
      </span>
      <span className="premium-float absolute right-[8%] top-[28%] rounded-full border border-border/12 bg-surface-raised/85 px-3 py-2 text-[.6875rem] font-bold shadow-soft backdrop-blur-md [animation-delay:-1.8s]">
        写作
      </span>
      <span className="premium-float absolute bottom-[13%] left-[14%] rounded-full border border-border/12 bg-surface-raised/85 px-3 py-2 text-[.6875rem] font-bold shadow-soft backdrop-blur-md [animation-delay:-3s]">
        图像
      </span>
    </div>
  );
}

export function HomeDashboard({
  displayName,
  latestConversation,
}: {
  displayName?: string;
  latestConversation?: HomeConversationPreview;
}) {
  const reduceMotion = useReducedMotion();
  const [greeting, setGreeting] = useState("欢迎回来");
  const [updatedLabel, setUpdatedLabel] = useState("最近更新");

  useEffect(() => {
    setGreeting(getTimeGreeting(new Date().getHours()));
    if (latestConversation) {
      setUpdatedLabel(
        new Intl.DateTimeFormat("zh-CN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(latestConversation.updatedAt)),
      );
    }
  }, [latestConversation]);

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.42, ease: [0.2, 0.8, 0.2, 1] as const };
  const welcome = displayName
    ? `${greeting}，${displayName}。`
    : `${greeting}。`;

  return (
    <div className="space-y-12 min-[821px]:space-y-14">
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="relative grid min-h-[35rem] overflow-hidden rounded-[1.7rem] border border-border/12 bg-gradient-to-br from-surface-raised via-surface-raised to-primary-subtle shadow-overlay min-[1024px]:min-h-[27rem] min-[1024px]:grid-cols-[1.16fr_.84fr] min-[1181px]:rounded-display"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        transition={transition}
      >
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(circle_at_82%_45%,black,transparent_57%)]" />
        <div className="relative z-10 flex flex-col justify-center px-5 pb-5 pt-8 min-[521px]:px-8 min-[821px]:px-10 min-[1024px]:py-12 min-[1181px]:pl-14">
          <div className="premium-kicker flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/.13)]" />
            PRIVATE · CALM · POWERFUL
          </div>
          <p className="mb-2 mt-6 text-sm font-bold text-muted-foreground">
            {welcome}
          </p>
          <h1 className="text-display max-w-[47rem] text-balance">
            把灵感、对话与工具，
            <span className="block text-primary">收进一个人的 AI 工作室。</span>
          </h1>
          <p className="mt-6 max-w-[38rem] text-body text-muted-foreground">
            不堆叠功能，不制造噪音。让常用助手、长期记忆和创作工具，在需要时自然出现。
          </p>
          <div className="mt-7 flex flex-col gap-2.5 min-[521px]:flex-row">
            <Button asChild size="lg">
              <Link className="justify-between min-[521px]:min-w-40" href="/chat">
                开始新对话
                <ArrowUpRight className="size-4 text-primary" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/personas/new">创建专属助手</Link>
            </Button>
          </div>
        </div>
        <AiCoreVisual />
      </motion.section>

      <section aria-labelledby="quick-start-title">
        <SectionHeader
          id="quick-start-title"
          kicker="QUICK START"
          title="从这里开始"
        />
        <div className="mt-5 grid gap-3.5 min-[1024px]:grid-cols-[1.35fr_.8fr] min-[1350px]:grid-cols-[1.55fr_.72fr_.72fr]">
          <Link
            className="group relative min-h-[17rem] overflow-hidden rounded-card border border-primary/16 bg-gradient-to-br from-primary-subtle to-surface-raised p-6 shadow-soft transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-1 hover:border-primary/35 hover:shadow-raised min-[1024px]:row-span-2 min-[1350px]:row-span-1"
            href={latestConversation ? `/chat/${latestConversation.id}` : "/chat"}
          >
            <span className="grid size-10 place-items-center rounded-[.8125rem] bg-foreground text-background">
              <MessageSquareText aria-hidden="true" className="size-[1.1rem]" />
            </span>
            <ArrowUpRight className="absolute right-5 top-5 size-4 text-muted-foreground" />
            <div className="mt-8 max-w-[58%] min-[1024px]:max-w-[52%]">
              <span className="premium-kicker">CONTINUE</span>
              <h2 className="mt-2 text-card-title">
                {latestConversation ? "继续上次的对话" : "开始第一段对话"}
              </h2>
              <p className="mt-2 text-supporting">
                {latestConversation
                  ? "带着已有上下文，回到你未完成的想法。"
                  : "选择默认助手或专属人格，建立属于你的连续工作空间。"}
              </p>
            </div>
            <div className="absolute bottom-5 right-5 w-[44%] rounded-[1rem] border border-border/12 bg-surface-raised/88 p-4 shadow-soft backdrop-blur-sm">
              <p className="truncate text-xs font-bold">
                {latestConversation?.title || "还没有最近对话"}
              </p>
              <p className="mt-1 truncate text-[.625rem] text-muted-foreground">
                {latestConversation
                  ? `${updatedLabel}${latestConversation.personaName ? ` · ${latestConversation.personaName}` : " · 默认助手"}`
                  : "点击开始，不使用任何虚构记录"}
              </p>
              <div className="mt-3 space-y-1.5" aria-hidden="true">
                <span className="block h-1 rounded-full bg-surface-muted" />
                <span className="block h-1 w-3/4 rounded-full bg-surface-muted" />
                <span className="block h-1 w-[88%] rounded-full bg-surface-muted" />
              </div>
            </div>
          </Link>

          <Link
            className="group relative min-h-[10.5rem] rounded-card border border-border/12 bg-surface/76 p-5 shadow-soft backdrop-blur-sm transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-1 hover:border-primary/30 hover:bg-surface-raised hover:shadow-raised"
            href="/tools"
          >
            <span className="grid size-10 place-items-center rounded-[.8125rem] bg-primary-subtle text-primary">
              <Wrench aria-hidden="true" className="size-[1.1rem]" />
            </span>
            <ArrowUpRight className="absolute right-5 top-5 size-4 text-muted-foreground" />
            <span className="premium-kicker mt-7 block">TOOLS</span>
            <h2 className="mt-1.5 text-card-title">调用工具</h2>
            <p className="mt-1.5 text-supporting">总结、改写、翻译与图片理解。</p>
          </Link>

          <Link
            className="group relative min-h-[10.5rem] rounded-card border border-border/12 bg-surface/76 p-5 shadow-soft backdrop-blur-sm transition-[border-color,box-shadow,transform] duration-panel hover:-translate-y-1 hover:border-primary/30 hover:bg-surface-raised hover:shadow-raised"
            href="/memories"
          >
            <span className="grid size-10 place-items-center rounded-[.8125rem] bg-primary-subtle text-primary">
              <Brain aria-hidden="true" className="size-[1.1rem]" />
            </span>
            <ArrowUpRight className="absolute right-5 top-5 size-4 text-muted-foreground" />
            <span className="premium-kicker mt-7 block">MEMORY</span>
            <h2 className="mt-1.5 text-card-title">查看长期记忆</h2>
            <p className="mt-1.5 text-supporting">你决定保留什么，也能随时修改。</p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="studio-title">
        <SectionHeader
          description="每项能力保持独立，但在需要时自然协同。"
          id="studio-title"
          kicker="YOUR STUDIO"
          title="构建你的 AI 工作空间"
        />
        <div className="mt-5 grid gap-3.5 min-[521px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {studioCapabilities.map((item, index) => (
            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }}
              key={item.number}
              transition={{
                ...transition,
                delay: reduceMotion ? 0 : index * 0.04,
              }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <Link
                className="group relative flex min-h-[13rem] h-full flex-col rounded-card border border-border/12 bg-surface/76 p-5 backdrop-blur-sm transition-[background-color,border-color,box-shadow,transform] duration-panel hover:-translate-y-1 hover:border-primary/25 hover:bg-surface-raised hover:shadow-soft min-[821px]:min-h-[15.5rem]"
                href={item.href}
              >
                <span className="absolute right-5 top-5 text-[.625rem] font-extrabold tracking-[.12em] text-muted-foreground">
                  {item.number}
                </span>
                <span className="grid size-11 place-items-center rounded-control bg-primary-subtle text-primary">
                  <item.icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-7 text-card-title">{item.title}</h3>
                <p className="mt-2 flex-1 text-supporting">{item.description}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-primary">
                  {item.action}
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[1.125rem] border border-border/12 bg-surface-muted/76 p-4 min-[521px]:flex-row min-[521px]:items-center min-[521px]:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-primary-subtle text-primary">
          <ShieldCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">你的内容按用途彼此隔离</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            对话、人格、长期记忆与独立工具各自遵循清晰边界，并可在账号设置中管理。
          </p>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/account">
            查看设置 <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
