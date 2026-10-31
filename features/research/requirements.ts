/*
 * Backend capabilities the Research Lab waits for. L-1 … L-5 were first written down in
 * docs/handoffs/2026-10-31-claude-showcase-d2a.md; L-6 … L-9 are added by P1-D2-B. Experiment
 * records cite these ids to explain why they have no result yet, and the handoff document
 * lists the same table for the backend owner.
 */
export const requirementIds = ["L-1", "L-2", "L-3", "L-4", "L-5", "L-6", "L-7", "L-8", "L-9"] as const;
export type RequirementId = (typeof requirementIds)[number];

export const requirements: Record<RequirementId, { title: string; detail: string }> = {
  "L-1": { title: "证据资产读取", detail: "只读、绑定 Release 的证据资产地址与元数据（来源摘要、分发摘要、扫描版本、数据等级）。" },
  "L-2": { title: "数据类证据资产", detail: "CSV、JSON 等研究证据的 MIME 白名单、大小上限与预览方式；目前发布绑定只接受 Markdown 与图片。" },
  "L-3": { title: "运行记录", detail: "绑定 Release、能力、种子与协议版本的运行记录：状态、结果、保留期限与可见性。" },
  "L-4": { title: "复现判定", detail: "由服务端按协议中的容差判断复现值与参考值是否一致；判定只追加记录，不修改已发布的 Release。" },
  "L-5": { title: "L1 沙箱", detail: "第三方实验室代码的独立 origin、消息协议版本与权限边界。" },
  "L-6": { title: "研究目录只读 API", detail: "研究项目、声明映射与实验记录的公开投影，含与 Showcase 项目的关联。" },
  "L-7": { title: "声明标识", detail: "researchClaims 需要稳定的 id，实验记录与证据才能引用到具体声明。" },
  "L-8": { title: "受控运行环境", detail: "服务端、GPU 或 Python 运行环境：镜像与依赖锁定、硬件规格随结果一起记录。" },
  "L-9": { title: "执行治理", detail: "发起人身份、配额与预算、运行隔离与审计日志；公开访问者不能触发服务端运行。" },
};
