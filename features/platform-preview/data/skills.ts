/*
 * Skills are planned: there is no Skill registry, runtime or install flow in the codebase.
 * Several entries wrap a capability that is already live as a Tool; they say so explicitly.
 */
import type { CapabilityStatus } from "@/features/platform-preview/status";

export interface PreviewSkill {
  slug: string;
  name: string;
  summary: string;
  category: "写作" | "视觉" | "协作" | "研究" | "开发";
  /** Status of the underlying capability (the Skill packaging itself is always planned). */
  capability: CapabilityStatus;
  liveTool?: { label: string; href: string };
  permissions: string[];
  inputs: string[];
  outputs: string[];
  usedBy: string[];
  /** Initial switch position in the demo management panel. */
  enabled: boolean;
}

export const skillCategories = ["全部", "写作", "视觉", "协作", "研究", "开发"] as const;

export const previewSkills: readonly PreviewSkill[] = [
  { slug: "summarize", name: "文本总结", summary: "把长文、纪要或对话整理成要点。", category: "写作", capability: "live", liveTool: { label: "文本总结", href: "/tools/summarize" }, permissions: ["读取输入文本", "调用平台模型"], inputs: ["文本（最长按工具限制）", "要点数量"], outputs: ["要点列表"], usedBy: ["Agent 标准模式", "项目周报（规划）"], enabled: true },
  { slug: "rewrite", name: "改写润色", summary: "按目标语气改写，保持原意。", category: "写作", capability: "live", liveTool: { label: "改写", href: "/tools/rewrite" }, permissions: ["读取输入文本", "调用平台模型"], inputs: ["文本", "目标语气"], outputs: ["改写结果"], usedBy: ["对话"], enabled: true },
  { slug: "translate", name: "保持语气翻译", summary: "中英互译，保留原文语气与格式。", category: "写作", capability: "live", liveTool: { label: "翻译", href: "/tools/translate" }, permissions: ["读取输入文本", "调用平台模型"], inputs: ["文本", "目标语言"], outputs: ["译文"], usedBy: ["对话"], enabled: true },
  { slug: "image-understanding", name: "图片理解", summary: "从截图、图表与照片中提取关键信息。", category: "视觉", capability: "live", liveTool: { label: "图片理解", href: "/tools/image" }, permissions: ["读取上传图片", "调用视觉模型"], inputs: ["单张图片", "问题"], outputs: ["文字说明"], usedBy: ["对话", "研究笔记工作区（示例）"], enabled: true },
  { slug: "image-generation", name: "文生图", summary: "一句话生成一张图片，保存在私有存储。", category: "视觉", capability: "live", liveTool: { label: "图片生成", href: "/tools/image-generate" }, permissions: ["调用图像模型", "写入私有存储"], inputs: ["描述", "画面风格"], outputs: ["1 张图片"], usedBy: ["AI-Generator 平台（示例）"], enabled: false },
  { slug: "brainstorm", name: "多视角头脑风暴", summary: "四个固定视角的 Worker 独立分析，再由协调器综合。", category: "协作", capability: "live", liveTool: { label: "多 Agent 头脑风暴", href: "/tools/brainstorm" }, permissions: ["调用平台模型"], inputs: ["问题"], outputs: ["4 份分析", "综合结论"], usedBy: ["Agent 编排"], enabled: true },
  { slug: "web-research", name: "检索与引用", summary: "检索资料并在回答中给出可核对的引用。", category: "研究", capability: "planned", permissions: ["访问受控搜索服务", "调用平台模型"], inputs: ["问题", "来源范围"], outputs: ["带引用的回答"], usedBy: ["Agent 深度模式（规划）"], enabled: false },
  { slug: "file-reader", name: "文件阅读", summary: "读取项目资料中的文档并回答问题。", category: "研究", capability: "planned", permissions: ["读取已批准的项目资产"], inputs: ["项目文档"], outputs: ["摘要", "问答"], usedBy: ["Projects（规划）"], enabled: false },
  { slug: "project-report", name: "项目周报", summary: "汇总项目内的对话、运行与变更，生成周报。", category: "协作", capability: "planned", permissions: ["读取项目运行记录", "调用平台模型"], inputs: ["项目", "时间范围"], outputs: ["周报草稿"], usedBy: ["Projects（规划）"], enabled: false },
  { slug: "code-sandbox", name: "沙箱代码执行", summary: "在隔离沙箱中运行代码。仅为长期方向，尚未批准开发。", category: "开发", capability: "planned", permissions: ["隔离沙箱（未批准）"], inputs: ["代码"], outputs: ["运行结果"], usedBy: ["—"], enabled: false },
];

export function getPreviewSkill(slug: string) {
  return previewSkills.find((skill) => skill.slug === slug);
}
