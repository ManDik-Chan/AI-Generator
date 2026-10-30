/*
 * Sample content for the AI Hub previews (Chat, Personas, Memory, Tools).
 * These features are live in the signed-in app; the preview only shows hand-written examples.
 */
import type { MemoryVerificationMethod } from "@prisma/client";

import type { ChatMessageView } from "@/features/chat/types";
import type { PersonaChatIdentity } from "@/features/persona/types";

export const previewPersonas: (PersonaChatIdentity & { tone: [string, string]; uses: string })[] = [
  { id: "sample-writer", name: "写作搭子", description: "润色、提纲与表达", avatarUrl: "/personas/avatar-1.svg", archived: false, tone: ["温和", "简洁"], uses: "示例 · 18 次对话" },
  { id: "sample-reviewer", name: "代码审查员", description: "只说重点，不绕弯子", avatarUrl: "/personas/avatar-5.svg", archived: false, tone: ["严谨", "直接"], uses: "示例 · 7 次对话" },
  { id: "sample-planner", name: "旅行规划师", description: "行程、预算与清单", avatarUrl: "/personas/avatar-9.svg", archived: false, tone: ["热情", "细致"], uses: "示例 · 4 次对话" },
  { id: "sample-analyst", name: "研究助理", description: "拆解问题，整理资料", avatarUrl: "/personas/avatar-3.svg", archived: false, tone: ["客观", "条理"], uses: "示例 · 11 次对话" },
];

export const previewConversations = [
  { id: "c1", title: "整理本周会议纪要", persona: "写作搭子", updated: "示例 · 10 分钟前", active: true },
  { id: "c2", title: "平台预览上线清单", persona: "默认助手", updated: "示例 · 2 小时前", active: false },
  { id: "c3", title: "京都行程草案", persona: "旅行规划师", updated: "示例 · 昨天", active: false },
];

export const previewMessages: ChatMessageView[] = [
  { id: "m1", role: "user", content: "帮我把这周的会议纪要整理成三个重点。", status: "complete", createdAt: "2026-10-29T10:00:00.000Z" },
  {
    id: "m2",
    role: "assistant",
    content: "好的，整理为三点（示例回答）：\n\n1. **目标对齐**：本季度聚焦留存。\n2. **排期调整**：设计评审提前到周三。\n3. **风险提示**：接口联调依赖外部团队。\n\n按你的偏好，我使用了分点、简洁的格式。",
    status: "complete",
    createdAt: "2026-10-29T10:00:08.000Z",
    memoryDisclosure: {
      version: 1,
      count: 1,
      items: [{ id: "00000000-0000-4000-8000-000000000001", content: "偏好分点、简洁的回答", category: "preference", scope: "GLOBAL", verificationMethod: "PROPOSAL_ACCEPTANCE" }],
    },
  },
];

export const previewMemories: { content: string; category: string; scope: "GLOBAL" | "PERSONA"; verification: MemoryVerificationMethod; source: string }[] = [
  { content: "偏好分点、简洁的回答", category: "preference", scope: "GLOBAL", verification: "PROPOSAL_ACCEPTANCE", source: "示例 · 来自 3 天前的对话" },
  { content: "常用语言：中文", category: "profile", scope: "GLOBAL", verification: "EXPLICIT_REQUEST", source: "示例 · 明确要求记住" },
  { content: "写作时避免使用感叹号", category: "constraint", scope: "PERSONA", verification: "MANUAL_ENTRY", source: "示例 · 手动添加到「写作搭子」" },
];

export const previewProposals = [
  { content: "计划 11 月去京都旅行", source: "示例 · 来自昨天的对话 · 30 天内有效" },
  { content: "正在准备平台化的产品演示", source: "示例 · 来自今天的对话 · 30 天内有效" },
];

export const previewTools = [
  { id: "summarize", title: "文本总结", description: "把长文、纪要或对话整理成要点。", href: "/tools/summarize", group: "文本" },
  { id: "rewrite", title: "改写", description: "按目标语气改写，保持原意。", href: "/tools/rewrite", group: "文本" },
  { id: "translate", title: "翻译", description: "中英互译，保留语气与格式。", href: "/tools/translate", group: "文本" },
  { id: "image", title: "图片理解", description: "从截图、图表与照片中提取关键信息。", href: "/tools/image", group: "图像" },
  { id: "image-generate", title: "图片生成", description: "每次生成一张图片，保存在私有空间。", href: "/tools/image-generate", group: "图像" },
  { id: "brainstorm", title: "多 Agent 头脑风暴", description: "四个 Worker 独立分析，再由协调器综合。", href: "/tools/brainstorm", group: "协作" },
  { id: "history", title: "运行历史", description: "查看工具状态、结果、恢复与下载。", href: "/tools/history", group: "系统" },
] as const;
