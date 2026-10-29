/**
 * Capability status used across the public /platform preview.
 * "live" is reserved for features that exist in the real, signed-in app today.
 */
export type CapabilityStatus = "live" | "dev" | "planned";

export const statusMeta: Record<CapabilityStatus, { label: string; description: string }> = {
  live: { label: "已上线", description: "真实应用中可用，登录后进入" },
  dev: { label: "开发中", description: "已有设计与部分代码，尚未通过验收" },
  planned: { label: "规划中", description: "仅有产品方向，界面为演示预览" },
};

/** Shown on every preview page and every block built from sample data. */
export const DEMO_LABEL = "演示预览";
export const SAMPLE_LABEL = "示例数据";
