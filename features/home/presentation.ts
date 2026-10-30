export function getTimeGreeting(hour: number) {
  if (hour < 5) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export interface HomeConversationPreview {
  id: string;
  title: string;
  updatedLabel: string;
  personaName?: string;
}

/** One row in "继续工作": a conversation, a tool run or an agent run. */
export interface HomeActivity {
  id: string;
  kind: "chat" | "tool" | "agent";
  title: string;
  meta: string;
  time: string;
  href: string;
  at: number;
}

export interface HomeMetrics {
  conversations: number;
  personas: number;
  memories: number;
  generatedImages: number;
  /** Undefined when the proposals table is unavailable in this environment. */
  pendingProposals?: number;
  toolRuns: number;
  activeAgentRuns: number;
}

export const toolTypeMeta = {
  SUMMARIZE: { label: "文本总结" },
  REWRITE: { label: "改写" },
  TRANSLATE: { label: "翻译" },
  IMAGE_ANALYZE: { label: "图片理解" },
  IMAGE_GENERATE: { label: "图片生成" },
  BRAINSTORM: { label: "多 Agent 头脑风暴" },
} as const;

/** One honest status sentence under the home title, built only from real counts. */
export function summarizeWorkspace(metrics: HomeMetrics | undefined) {
  if (!metrics) return "工作台已就绪。";
  const parts: string[] = [];
  if (metrics.conversations) parts.push(`${metrics.conversations} 段对话`);
  if (metrics.pendingProposals) parts.push(`${metrics.pendingProposals} 条记忆待确认`);
  if (metrics.activeAgentRuns) parts.push(`${metrics.activeAgentRuns} 个 Agent 运行中`);
  if (metrics.toolRuns) parts.push(`${metrics.toolRuns} 次工具运行`);
  return parts.length ? `${parts.join(" · ")}。` : "还没有任何记录，从一段对话或一个项目开始。";
}
