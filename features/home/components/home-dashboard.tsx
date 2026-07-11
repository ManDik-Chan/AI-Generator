"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Brain, MessageSquareText, PenLine, ScanSearch, Sparkles } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const quickActions = [
  {
    title: "开始聊天",
    description: "选择一个助手，开启持续对话。",
    href: "/chat",
    icon: MessageSquareText,
  },
  {
    title: "创建人格",
    description: "定义身份、语气与擅长领域。",
    href: "/personas",
    icon: Sparkles,
  },
  {
    title: "文本创作",
    description: "写作、润色、总结与翻译。",
    href: "/tools",
    icon: PenLine,
  },
  {
    title: "理解图片",
    description: "上传图片，获得结构化分析。",
    href: "/tools",
    icon: ScanSearch,
  },
];

export function HomeDashboard() {
  return (
    <div>
      <header className="mb-8 flex items-center justify-between md:hidden">
        <Brand />
        <span className="grid size-10 place-items-center rounded-full border bg-card text-sm font-semibold">M</span>
      </header>

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border bg-card p-6 shadow-soft sm:p-9 lg:p-12"
        initial={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="max-w-3xl">
          <Badge>Simple · Beautiful · Private</Badge>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            一个真正属于你的
            <span className="text-primary"> AI 空间</span>
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            创建熟悉你的人格助手，让每次交流延续上下文；也可以快速完成写作、总结、翻译与图片理解。
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/chat">
                开始对话
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/personas">创建 AI 人格</Link>
            </Button>
          </div>
        </div>
      </motion.section>

      <section className="mt-9" aria-labelledby="quick-actions-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">快速开始</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight" id="quick-actions-title">
              今天想做什么？
            </h2>
          </div>
          <Brain className="hidden size-6 text-muted-foreground sm:block" aria-hidden="true" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 10 }}
              key={action.title}
              transition={{ delay: 0.08 * index, duration: 0.35 }}
            >
              <Link
                className="group block h-full rounded-2xl border bg-card p-5 transition duration-200 hover:-translate-y-1 hover:border-primary/35 hover:shadow-soft"
                href={action.href}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-muted text-primary">
                  <action.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-semibold">{action.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  打开
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
