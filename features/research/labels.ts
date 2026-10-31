import type { Tone } from "@/features/platform/labels";
import type { EvidenceAvailability, EvidenceKind, ExecutionSite, ExperimentRecord, ExperimentStatus } from "@/features/research/types";

export const experimentStatusMeta: Record<ExperimentStatus, { label: string; tone: Tone; detail: string }> = {
  REPRODUCIBLE: { label: "可本地复现", tone: "success", detail: "确定性实验。参考结果在页面构建时由仓库代码计算，你可以在浏览器中用同一份代码重算并逐项比对。" },
  TEST_COVERED: { label: "测试覆盖", tone: "info", detail: "结论由仓库中的自动化测试检查，CI 在每个 Pull Request 上运行。本页不执行测试，只给出位置与命令。" },
  PLANNED: { label: "计划中", tone: "neutral", detail: "只有实验协议，尚未执行，因此没有任何结果。" },
  BLOCKED: { label: "受阻", tone: "warning", detail: "需要平台尚未提供的能力才能执行。页面列出解锁条件，不显示结果。" },
};

/** Display order: what a visitor can check now comes first. */
export const experimentStatusOrder: ExperimentStatus[] = ["REPRODUCIBLE", "TEST_COVERED", "PLANNED", "BLOCKED"];

export const siteMeta: Record<ExecutionSite, { label: string; detail: string }> = {
  browser: { label: "浏览器内", detail: "在访问者的设备上运行，不发送任何请求" },
  ci: { label: "仓库测试 · CI", detail: "在检出的仓库或 CI 中运行" },
  server: { label: "受控服务端", detail: "需要平台提供的服务端运行环境" },
  gpu: { label: "GPU 运行环境", detail: "需要平台提供的 GPU 运行环境" },
};

export const evidenceKindMeta: Record<EvidenceKind, { label: string }> = {
  source: { label: "源码" },
  test: { label: "测试" },
  doc: { label: "文档" },
  asset: { label: "证据资产" },
};

export const availabilityMeta: Record<EvidenceAvailability, { label: string }> = {
  open: { label: "可打开" },
  pending: { label: "尚未开放分发" },
  sample: { label: "示例 · 无可打开的内容" },
};

export const reproducibilityLabel: Record<ExperimentRecord["reproducibility"]["level"], string> = {
  exact: "逐位一致",
  tolerance: "容差内一致",
  tests: "由测试复现",
  none: "暂不可复现",
};

export const RESEARCH_FIXTURE_LABEL = "Fixture · 演示数据";

export function experimentSegment(id: string) {
  return id.toLowerCase();
}
