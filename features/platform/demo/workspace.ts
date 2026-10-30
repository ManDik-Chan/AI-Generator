/*
 * Sample account data for the public demo workspace (/platform). Every row is written
 * by hand and labelled as sample data wherever it is shown.
 */
import type { HomeActivity, HomeMetrics } from "@/features/home/presentation";

export const demoMetrics: HomeMetrics = {
  conversations: 12,
  personas: 4,
  memories: 9,
  generatedImages: 6,
  pendingProposals: 2,
  toolRuns: 27,
  activeAgentRuns: 1,
};

export const demoActivity: HomeActivity[] = [
  { id: "d1", kind: "agent", title: "把一个研究问题拆成可以并行推进的子任务", meta: "Agent · 进行中 · Worker 2/6", time: "示例 · 18:02", href: "/platform/agent/sample-research-split", at: 6 },
  { id: "d2", kind: "chat", title: "整理本周会议纪要", meta: "对话 · 写作搭子", time: "示例 · 17:40", href: "/platform/chat", at: 5 },
  { id: "d3", kind: "tool", title: "实验记录翻译成英文", meta: "翻译 · 已完成", time: "示例 · 16:12", href: "/platform/tools", at: 4 },
  { id: "d4", kind: "agent", title: "为平台预览整理一份上线前检查清单", meta: "Agent · 已完成 · Worker 4/4", time: "示例 · 15:30", href: "/platform/agent/sample-launch-plan", at: 3 },
  { id: "d5", kind: "tool", title: "晨雾中的玻璃温室", meta: "图片生成 · 已完成", time: "示例 · 昨天", href: "/platform/tools", at: 2 },
];
