/**
 * Capability status shared by the site, the workspace and the demo workspace.
 * "live" is reserved for features that work in the signed-in app today.
 */
export type CapabilityStatus = "live" | "dev" | "planned";

export const statusMeta: Record<CapabilityStatus, { label: string; english: string; description: string }> = {
  live: { label: "已上线", english: "Live", description: "真实可用，登录后进入" },
  dev: { label: "开发中", english: "In development", description: "已有设计与部分代码，尚未通过验收" },
  planned: { label: "规划中", english: "Planned", description: "仅有产品方向，界面为演示状态" },
};

/** Where the data on a page comes from. Pages must show this whenever it is not "account". */
export type DataSource = "account" | "demo";

/** Label for modules whose backend is not deployed yet: the UI works, nothing is saved. */
export const DEMO_STATE_LABEL = "演示状态";
/** Label for hand-written sample records. */
export const SAMPLE_LABEL = "示例";
