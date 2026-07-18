import type { AgentRunMode } from "@prisma/client";

import { getAgentModeLimits } from "@/features/agents/constants";
import type { AgentPlan, AgentPlanWorker } from "@/features/agents/types";

const fallbackAssignments: AgentPlanWorker[] = [
  { key: "problem-frame", name: "问题框定 Worker", title: "明确问题与约束", objective: "识别用户目标、已知条件、关键限制和需要澄清的假设。", expectedDeliverable: "一份简明的问题框架、约束清单和关键假设。", priority: "HIGH", dependsOn: [] },
  { key: "domain-analysis", name: "领域分析 Worker", title: "分析核心方案", objective: "从问题所属领域分析主要路径、可行选项与关键权衡。", expectedDeliverable: "可比较的核心发现、方案和权衡说明。", priority: "HIGH", dependsOn: [] },
  { key: "risk-review", name: "风险审查 Worker", title: "审查风险与未知项", objective: "识别失败条件、遗漏信息、安全风险和需要验证的未知项。", expectedDeliverable: "按影响排序的风险、未知项和缓解建议。", priority: "MEDIUM", dependsOn: [] },
  { key: "action-plan", name: "行动规划 Worker", title: "形成可执行路径", objective: "把问题转化为优先级明确、可验证且可回退的下一步。", expectedDeliverable: "分阶段行动计划、验证点和备选路径。", priority: "HIGH", dependsOn: ["problem-frame"] },
  { key: "alternative-review", name: "备选方案 Worker", title: "比较替代方向", objective: "提出与主路径不同的替代方案，并说明各自适用条件。", expectedDeliverable: "备选方向、适用条件和选择标准。", priority: "MEDIUM", dependsOn: [] },
  { key: "validation-design", name: "验证设计 Worker", title: "设计验证方法", objective: "为关键结论设计低风险验证方法、成功标准和停止条件。", expectedDeliverable: "验证清单、成功指标和停止条件。", priority: "MEDIUM", dependsOn: ["problem-frame"] },
];

export function buildFallbackAgentPlan(mode: AgentRunMode): AgentPlan {
  const count = getAgentModeLimits(mode).workerCount;
  return {
    overview: "Planner 输出不可用，主 Agent 已采用确定性的安全回退计划；Worker 只执行推理、分析、规划和内容任务。",
    workers: fallbackAssignments.slice(0, count).map((worker) => ({ ...worker, dependsOn: [...worker.dependsOn] })),
  };
}
