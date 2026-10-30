/*
 * Platform fixtures.
 *
 * - "ai-generator" is real: it describes this repository. Its releases are the merged
 *   pull requests on main and its documents link to files that exist in the repo.
 * - Every other project is a hand-written sample (provenance: "sample"). Sample projects
 *   never claim measured results: metrics stay UNPUBLISHED unless they are computed live
 *   in the visitor's browser by code on the page itself.
 *
 * Nothing here is read from or written to a database. The Registry is not deployed.
 */
import type { PlatformProject, ProjectGrant, ProviderCredential } from "@/features/platform/types";

const REPO = "https://github.com/ManDik-Chan/AI-Generator";

const aiGenerator: PlatformProject = {
  slug: "ai-generator",
  name: "AI-Generator",
  tagline: "隐私优先的项目平台，以及内置的 AI Hub。",
  summary:
    "本站自身。开发者在这里展示成果、发布不可变版本，并在明确授权下提供可运行的能力；对话、人格、长期记忆与工具组成平台内置的 AI Hub。",
  category: "web-service",
  owner: "AIG 平台团队",
  visibility: "PUBLIC",
  draftState: "PUBLISHED",
  version: "main · 0e13d32",
  integration: "SHOWCASE",
  art: "agents",
  provenance: "real",
  updated: "2026-10-28",
  tags: ["Next.js 15", "Supabase", "Prisma", "OpenAI-compatible"],
  capabilities: [
    { id: "hub.chat", label: "AI 对话", status: "live", detail: "流式回答、会话历史，回答下方披露本轮引用的已确认记忆。", dataFlow: "platform" },
    { id: "hub.memory", label: "可信长期记忆", status: "live", detail: "模型只提出建议，你确认后才写入正式记忆。", dataFlow: "platform" },
    { id: "hub.tools", label: "文本与图片工具", status: "live", detail: "总结、改写、翻译、图片理解、图片生成与多视角头脑风暴。", dataFlow: "platform" },
    { id: "hub.agent", label: "Agent 编排", status: "dev", detail: "Planner 拆解、多个 Worker 并行、协调器收束；Draft 验收中。", dataFlow: "platform" },
    { id: "registry.publish", label: "项目发布与审核", status: "dev", detail: "草稿、独立审核、不可变版本与可撤回发布；数据模型验收中。", dataFlow: "none" },
    { id: "credentials.byok", label: "自带模型凭据", status: "planned", detail: "先完成 KMS、加密保管、出站控制与授权设计，再开放。", dataFlow: "platform" },
  ],
  claims: [
    { topic: "可信长期记忆", status: "SOURCE_IMPLEMENTED", description: "隐式提取只创建待确认提案；接受后经同一可信事务写入正式记忆。" },
    { topic: "记忆来源与本轮引用", status: "SOURCE_IMPLEMENTED", description: "正式记忆标注核验来源，回答下方展示本轮实际注入的记忆。" },
    { topic: "私有资产删除一致性", status: "SOURCE_IMPLEMENTED", description: "删除标记、不可变清理身份、队列与归属外键校验已合并到 main。" },
    { topic: "项目 Registry", status: "DOCUMENTED", description: "P0.5 契约与 P1-B 数据模型已成文，尚未部署到任何环境。" },
    { topic: "凭据网关（BYOK）", status: "PLANNED", description: "只有设计约束，没有实现。" },
  ],
  overview: [
    {
      title: "它是什么",
      body: "AI-Generator 从一个私人 AI 助手出发，正在演进为隐私优先的项目平台：Project 是一级实体，可以只展示、不运行，也可以通过受控接入提供可交互的能力。原有的对话、人格、长期记忆与工具保留下来，组成平台内置的 AI Hub。",
    },
    {
      title: "隐私如何分层",
      body: "项目可见性、用户数据与运行授权分别治理。公开一个项目，不会让任何使用者的输入、结果或凭据随之公开；项目作者也不能因为“是作者”就读取使用者的数据。",
    },
    {
      title: "现在能用什么",
      body: "AI Hub 已上线，登录即可使用。项目 Registry、发布审核与 BYOK 仍在开发或设计阶段，平台中对应的模块以「演示状态」呈现：界面可以完整浏览和操作，但不会保存任何内容。",
    },
  ],
  architecture: [
    { name: "体验层", items: ["Next.js 15 App Router · React 19", "公开站点与工作台共用一套纸墨视觉", "SSE 流式界面与可恢复的任务观察"] },
    { name: "平台层", items: ["Supabase Auth 服务端身份校验", "Prisma + PostgreSQL，版本化 migration 与 RLS", "私有 Storage 与资产删除一致性"] },
    { name: "能力层", items: ["OpenAI-compatible Provider，密钥只在服务端", "Embedding 语义召回 + 关键词 RRF 混合排序", "多 Worker Agent 编排（Draft）"] },
    { name: "规划中", items: ["Project · Version · Release Registry", "Grant 与 Credential Gateway", "远程 API Adapter（L2）"], planned: true },
  ],
  benchmarks: [
    { name: "对话首字延迟", dataset: "—", status: "UNPUBLISHED", note: "没有可复现的测量方案，不发布数值。" },
    { name: "记忆召回命中率", dataset: "—", status: "UNPUBLISHED", note: "需要标注评测集，尚未建立。" },
  ],
  docs: [
    { title: "整体架构", kind: "guide", language: "zh-CN", summary: "路由、服务层、数据层与信任边界。", href: `${REPO}/blob/main/docs/architecture.md` },
    { title: "可信长期记忆提案", kind: "reference", language: "zh-CN", summary: "提案、接受、拒绝与正式写入的事务规则。", href: `${REPO}/blob/main/docs/trusted-memory-proposals.md` },
    { title: "记忆来源与引用披露", kind: "reference", language: "zh-CN", summary: "核验方法、旧版记忆与本轮引用展示。", href: `${REPO}/blob/main/docs/memory-provenance-and-reference-transparency.md` },
    { title: "Agent 模式", kind: "guide", language: "zh-CN", summary: "Planner、Worker、协调器与恢复机制。", href: `${REPO}/blob/main/docs/agent-mode.md` },
    { title: "安全加固与部署", kind: "guide", language: "zh-CN", summary: "RLS、grants 与部署顺序。", href: `${REPO}/blob/main/docs/security-hardening-deployment.md` },
  ],
  releases: [
    { version: "PR #27", state: "PUBLISHED", date: "2026-10-28", title: "私有资产安全补丁（P1-A）", notes: ["资产删除标记与不可变清理身份", "上传预留与附件围栏", "工具资产归属外键校验"], href: `${REPO}/pull/27` },
    { version: "PR #25", state: "PUBLISHED", date: "2026-10-28", title: "公开主页与工作台视觉", notes: ["新的公开主页与中英文切换", "工作台视觉 Token 与外壳换装"], href: `${REPO}/pull/25` },
    { version: "PR #24", state: "PUBLISHED", date: "2026-07-29", title: "记忆来源核验与本轮引用", notes: ["正式记忆的核验来源", "回答下方披露本轮注入的记忆"], href: `${REPO}/pull/24` },
    { version: "PR #23", state: "PUBLISHED", date: "2026-07-27", title: "可信长期记忆提案", notes: ["隐式提取改为待确认提案", "接受与明确记住共用可信写入"], href: `${REPO}/pull/23` },
    { version: "PR #22", state: "PUBLISHED", date: "2026-07-22", title: "RLS 与用量账本加固", notes: ["受保护表 RLS 与受限 grants", "迁移验收进入 CI"], href: `${REPO}/pull/22` },
    { version: "PR #20", state: "PUBLISHED", date: "2026-07-19", title: "Agent Worker 编排底座（Draft）", notes: ["Planner、DAG 与隔离 Worker 池", "单 Worker 与全局取消"], href: `${REPO}/pull/20` },
    { version: "PR #15", state: "PUBLISHED", date: "2026-07-17", title: "AI 图片生成工作台", notes: ["单图文生图与私有画廊", "停止与后台恢复"], href: `${REPO}/pull/15` },
  ],
  members: [{ name: "项目所有者", roles: ["OWNER", "PUBLISHER"] }],
  assets: [],
  runs: [],
  lab: "hub",
  links: [
    { label: "源代码", href: REPO },
    { label: "www.ai-mdc.com", href: "https://www.ai-mdc.com" },
  ],
  ownedByViewer: false,
};

const volume: PlatformProject = {
  slug: "volume-reconstruction",
  name: "体数据三维重建",
  tagline: "从切片到三维网格：一个科研成果在平台上应有的样子。",
  summary:
    "科研展示模板。演示研究项目如何呈现动机、方法、可交互样例、模型卡与版本。实验室中的影像全部由程序生成，不含任何真实病例，也不是诊断工具。",
  category: "research",
  owner: "示例研究组",
  visibility: "PUBLIC",
  draftState: "PUBLISHED",
  version: "0.3.0",
  integration: "SHOWCASE",
  art: "tide",
  provenance: "sample",
  updated: "示例 · 3 天前",
  tags: ["体数据", "分割", "三维重建", "合成样例"],
  capabilities: [
    { id: "presentation.read", label: "成果展示", status: "live", detail: "概览、架构、模型卡与版本记录。", dataFlow: "none" },
    { id: "visualization.volume", label: "三平面切片与三维浏览", status: "live", detail: "在你的浏览器中渲染合成体数据，不上传任何内容。", dataFlow: "none" },
    { id: "inference.reconstruction.async", label: "异步重建任务", status: "planned", detail: "需要远程 Adapter、GPU Worker 与运行授权，平台尚未开放。", dataFlow: "developer" },
  ],
  claims: [
    { topic: "阈值分割与连通域去噪", status: "SOURCE_IMPLEMENTED", description: "示例声明：处理流程在源码中可定位。" },
    { topic: "等值面网格生成", status: "SOURCE_IMPLEMENTED", description: "示例声明：Marching Cubes 生成网格。" },
    { topic: "学习型分割模型", status: "DOCUMENTED", description: "示例声明：只在文档中描述，权重与实验尚未核验。" },
    { topic: "分割精度", status: "PLANNED", description: "没有可复现实验，因此不发布任何精度数值。" },
  ],
  overview: [
    { title: "动机", body: "很多研究成果只存在于论文和本地脚本里。这个模板展示一项体数据研究在平台上如何被完整阅读：问题是什么、方法如何组成、哪些结论有证据、哪些只是计划。" },
    { title: "方法", body: "合成体数据经过窗宽窗位、阈值分割与连通域去噪，得到目标掩膜；再用等值面提取生成三维网格。实验室把这条流水线的中间结果以切片和点云形式呈现出来。" },
    { title: "限制", body: "所有样例都是程序生成的合成数据。真实影像涉及 DICOM 头信息、像素内文字与衍生结果的去标识化，平台默认不接收真实医学数据，研究展示也不构成临床诊断。" },
  ],
  architecture: [
    { name: "输入", items: ["合成体数据 64³（浏览器内生成）", "NIfTI / DICOM 导入（规划）"] },
    { name: "处理", items: ["窗宽窗位", "阈值分割", "连通域去噪"] },
    { name: "重建", items: ["等值面提取", "网格简化与法线估计"] },
    { name: "交付", items: ["平台 Viewer（本页实验室）", "远程 Adapter · 异步任务（L2，规划）"], planned: true },
  ],
  benchmarks: [
    { name: "Dice 系数", dataset: "—", status: "UNPUBLISHED", note: "没有经过审核的评测数据集。" },
    { name: "单例推理时延", dataset: "—", status: "UNPUBLISHED", note: "未在受控硬件上测量。" },
    { name: "峰值显存", dataset: "—", status: "UNPUBLISHED", note: "未测量。" },
  ],
  docs: [
    { title: "模型卡", kind: "model-card", language: "zh-CN", summary: "适用范围、输入要求、已知限制与验证状态（示例）。" },
    { title: "合成数据说明", kind: "data", language: "zh-CN", summary: "样例如何生成，为什么不含任何真实病例。" },
    { title: "重建任务 API 草案", kind: "reference", language: "en", summary: "POST /runs 返回 202 与 runId；状态轮询与取消（拟议）。" },
  ],
  releases: [
    { version: "0.3.0", state: "PUBLISHED", date: "示例 · 3 天前", title: "交互实验室", notes: ["三平面切片与掩膜叠加", "点云形式的三维预览"] },
    { version: "0.2.0", state: "PUBLISHED", date: "示例 · 2 周前", title: "模型卡与数据说明", notes: ["补充适用范围与限制"] },
    { version: "0.1.0", state: "WITHDRAWN", date: "示例 · 1 个月前", title: "首个版本（已撤回）", notes: ["数据说明不完整，审核后撤回；历史保留，不可复活"] },
  ],
  members: [
    { name: "示例研究者", roles: ["OWNER", "EDITOR"] },
    { name: "示例审核人", roles: ["REVIEWER", "PUBLISHER"] },
    { name: "示例协作者", roles: ["VIEWER"] },
  ],
  assets: [
    { name: "synthetic-volume-64.raw", mime: "application/octet-stream", size: "256 KB", state: "APPROVED", dataClass: "SYNTHETIC" },
    { name: "model-card.md", mime: "text/markdown", size: "9 KB", state: "APPROVED", dataClass: "PUBLIC" },
    { name: "pipeline-figure.png", mime: "image/png", size: "380 KB", state: "VALIDATED", dataClass: "PUBLIC" },
    { name: "scan-upload-0412.dcm", mime: "application/dicom", size: "4.1 MB", state: "REJECTED", dataClass: "PRIVATE" },
  ],
  runs: [
    { id: "run_7Hq2", capability: "inference.reconstruction.async", status: "SUCCEEDED", started: "示例 · 今天 10:42", duration: "38 秒", actor: "示例研究者", note: "测试 Adapter · 合成数据" },
    { id: "run_6Zp8", capability: "inference.reconstruction.async", status: "RUNNING", started: "示例 · 今天 10:51", duration: "—", actor: "示例协作者", note: "测试 Adapter · 合成数据" },
    { id: "run_5Kd1", capability: "inference.reconstruction.async", status: "TIMED_OUT", started: "示例 · 昨天 18:20", duration: "10 分钟", actor: "示例研究者", note: "超过项目运行时长上限" },
    { id: "run_4Ma3", capability: "inference.reconstruction.async", status: "CANCELLED", started: "示例 · 昨天 17:02", duration: "12 秒", actor: "示例研究者" },
  ],
  lab: "volume",
  ownedByViewer: true,
};

const sorting: PlatformProject = {
  slug: "sorting-lab",
  name: "排序算法对照实验",
  tagline: "非 AI 项目也能被完整展示：方法、实验与可复现的运行。",
  summary:
    "算法项目示例。对比插入排序、归并排序与快速排序在不同输入分布下的比较次数。实验室在你的浏览器中真实运行，数字当场计算，不经过任何服务器。",
  category: "algorithm",
  owner: "示例作者",
  visibility: "PUBLIC",
  draftState: "PUBLISHED",
  version: "1.0.0",
  integration: "SHOWCASE",
  art: "citron",
  provenance: "sample",
  updated: "示例 · 昨天",
  tags: ["算法", "可复现", "浏览器内运行"],
  capabilities: [
    { id: "presentation.read", label: "成果展示", status: "live", detail: "方法、实验设计与版本记录。", dataFlow: "none" },
    { id: "static-image.read", label: "可视化", status: "live", detail: "排序过程在本页实时绘制。", dataFlow: "none" },
  ],
  claims: [
    { topic: "比较次数统计", status: "EXPERIMENT_VERIFIED", description: "每次比较都由实验室代码计数，结果在你的浏览器中可复现。" },
    { topic: "运行时间对比", status: "PLANNED", description: "浏览器计时受设备影响，暂不作为结论发布。" },
  ],
  overview: [
    { title: "问题", body: "教科书给出渐近复杂度，但真实输入往往部分有序、含大量重复值。这个项目用同一组输入，直接数出三种算法各做了多少次比较。" },
    { title: "方法", body: "固定随机种子生成四种分布的数组：随机、近乎有序、逆序、大量重复。每种算法在相同副本上运行，比较器负责计数。" },
    { title: "可复现性", body: "实验室和基准表使用同一段代码；刷新页面、改变种子都会得到可以核对的结果。这是 L0 展示型接入：不运行任何外部代码。" },
  ],
  architecture: [
    { name: "输入", items: ["带种子的伪随机数生成器", "四种输入分布"] },
    { name: "算法", items: ["插入排序", "自顶向下归并排序", "三数取中快速排序"] },
    { name: "度量", items: ["比较次数计数器", "逐步可视化"] },
  ],
  benchmarks: [
    { name: "比较次数", dataset: "n = 64 · 四种分布 · 种子 2026", status: "COMPUTED_LIVE", note: "表中的数字由本页代码在你的浏览器中计算。" },
    { name: "运行时间", dataset: "—", status: "UNPUBLISHED", note: "浏览器计时噪声大，不作为结论。" },
  ],
  docs: [
    { title: "方法与复现步骤", kind: "guide", language: "zh-CN", summary: "分布生成、比较器计数与种子说明。" },
    { title: "变更记录", kind: "changelog", language: "zh-CN", summary: "每个发布版本的差异。" },
  ],
  releases: [
    { version: "1.0.0", state: "PUBLISHED", date: "示例 · 昨天", title: "四种分布与逐步可视化", notes: ["新增大量重复值分布", "审核人与提交人不同"] },
    { version: "0.9.0", state: "WITHDRAWN", date: "示例 · 上周", title: "预览版（已撤回）", notes: ["快速排序基准选择有误，已撤回"] },
  ],
  members: [
    { name: "示例作者", roles: ["OWNER", "EDITOR"] },
    { name: "示例审核人", roles: ["REVIEWER", "PUBLISHER"] },
  ],
  assets: [
    { name: "method.md", mime: "text/markdown", size: "6 KB", state: "APPROVED", dataClass: "PUBLIC" },
    { name: "cover.png", mime: "image/png", size: "210 KB", state: "APPROVED", dataClass: "PUBLIC" },
  ],
  runs: [],
  lab: "sorting",
  ownedByViewer: true,
};

const typeSpecimen: PlatformProject = {
  slug: "type-specimen",
  name: "中西文混排样张",
  tagline: "一个只展示、不运行的软件项目。",
  summary:
    "软件项目示例。记录中西文混排时的字号、行距与标点挤压规则，提供可下载的样张与说明文档。没有在线运行能力，也不需要任何授权。",
  category: "software",
  owner: "示例设计师",
  visibility: "PUBLIC",
  draftState: "PUBLISHED",
  version: "2.1.0",
  integration: "SHOWCASE",
  art: "bloom",
  provenance: "sample",
  updated: "示例 · 上周",
  tags: ["排版", "字体", "静态展示"],
  capabilities: [
    { id: "documentation.read", label: "文档阅读", status: "live", detail: "排版规则与样张说明。", dataFlow: "none" },
    { id: "static-image.read", label: "样张图片", status: "live", detail: "经审核批准的静态图片。", dataFlow: "none" },
  ],
  claims: [{ topic: "标点挤压规则", status: "DOCUMENTED", description: "示例声明：规则写在文档中，尚无自动化测试。" }],
  overview: [
    { title: "内容", body: "以样张说明中文与拉丁字母同排时的基线、字距与行距选择。项目只包含文档和图片，是最简单的 L0 展示型项目。" },
    { title: "为什么放在这里", body: "平台不只服务 AI 项目。一个完整的成果页、稳定的版本链接和清楚的变更记录，对任何作品都有价值。" },
  ],
  architecture: [{ name: "内容", items: ["Markdown 文档", "已批准的样张图片"] }],
  benchmarks: [],
  docs: [{ title: "混排规则", kind: "guide", language: "zh-CN", summary: "字号、行距与标点挤压。" }],
  releases: [
    { version: "2.1.0", state: "PUBLISHED", date: "示例 · 上周", title: "补充竖排说明", notes: ["新增竖排样张"] },
    { version: "2.0.0", state: "PUBLISHED", date: "示例 · 3 个月前", title: "重写行距规则", notes: ["行距改为以字号倍数描述"] },
  ],
  members: [{ name: "示例设计师", roles: ["OWNER", "EDITOR", "PUBLISHER"] }, { name: "示例审核人", roles: ["REVIEWER"] }],
  assets: [{ name: "specimen-a3.pdf", mime: "application/pdf", size: "2.4 MB", state: "APPROVED", dataClass: "PUBLIC" }],
  runs: [],
  ownedByViewer: false,
};

const airQuality: PlatformProject = {
  slug: "air-quality",
  name: "城市空气质量摘要",
  tagline: "通过远程 API 提供能力的项目，数据去向写在最前面。",
  summary:
    "远程 API 项目示例（L2）。输入城市与日期，返回空气质量摘要。说明当输入要交给开发者运营的服务时，平台如何呈现数据去向、授权范围与异步任务。",
  category: "web-service",
  owner: "示例开发者",
  visibility: "UNLISTED",
  draftState: "IN_REVIEW",
  version: "0.2.0",
  integration: "REMOTE_API",
  art: "ember",
  provenance: "sample",
  updated: "示例 · 2 小时前",
  tags: ["远程 API", "异步任务", "授权"],
  capabilities: [
    { id: "presentation.read", label: "成果展示", status: "live", detail: "接口说明与数据去向。", dataFlow: "none" },
    { id: "summary.read.async", label: "空气质量摘要", status: "planned", detail: "平台代理调用开发者服务；需要你的授权，结果仅你可见。", dataFlow: "developer" },
  ],
  claims: [{ topic: "数据来源", status: "DOCUMENTED", description: "示例声明：开发者说明了上游公开数据源，平台尚未核验。" }],
  overview: [
    { title: "它做什么", body: "根据城市与日期返回一段空气质量摘要。计算发生在开发者自己的服务器上，平台负责授权、任务状态和结果的访问控制。" },
    { title: "数据去向", body: "你提交的城市与日期会发送到开发者运营的服务。平台在每次运行前展示这一点，并要求你单独同意；开发者看不到你的账户信息。" },
  ],
  architecture: [
    { name: "平台", items: ["授权检查与额度", "异步任务状态机", "结果访问控制"] },
    { name: "开发者服务", items: ["已注册的端点版本", "OpenAPI 3.1 契约", "签名回调（规划）"], planned: true },
  ],
  benchmarks: [],
  docs: [{ title: "OpenAPI 契约", kind: "reference", language: "en", summary: "POST /runs、GET /runs/{runId}、POST /runs/{runId}/cancel。" }],
  releases: [{ version: "0.2.0", state: "IN_REVIEW", date: "示例 · 2 小时前", title: "等待审核", notes: ["审核人不能是提交人"] }],
  members: [{ name: "示例开发者", roles: ["OWNER", "EDITOR"] }, { name: "示例同事", roles: ["VIEWER"] }],
  assets: [{ name: "openapi.json", mime: "application/json", size: "14 KB", state: "VALIDATED", dataClass: "PUBLIC" }],
  runs: [
    { id: "run_3Wx9", capability: "summary.read.async", status: "SUCCEEDED", started: "示例 · 今天 09:12", duration: "4 秒", actor: "示例开发者", note: "测试 Adapter" },
    { id: "run_3Wx4", capability: "summary.read.async", status: "FAILED", started: "示例 · 今天 09:05", duration: "1 秒", actor: "示例开发者", note: "上游返回 503，错误码已记录" },
  ],
  lab: "api",
  ownedByViewer: true,
};

const notes: PlatformProject = {
  slug: "research-notes",
  name: "研究笔记工作区",
  tagline: "私有项目：只有成员可见。",
  summary: "私有项目示例。用来整理资料、对话与 Agent 结论；不会出现在探索目录，链接对非成员无效。",
  category: "other",
  owner: "你",
  visibility: "PRIVATE",
  draftState: "DRAFT",
  version: "0.0.1",
  integration: "SHOWCASE",
  art: "stone",
  provenance: "sample",
  updated: "示例 · 3 天前",
  tags: ["私有", "草稿"],
  capabilities: [{ id: "documentation.read", label: "文档阅读", status: "live", detail: "仅成员。", dataFlow: "none" }],
  claims: [],
  overview: [{ title: "用途", body: "把一个长期问题的资料、对话和结论放在一起。私有项目的所有内容都不会公开，即使未来改为公开，也需要逐项重新审核。" }],
  architecture: [],
  benchmarks: [],
  docs: [],
  releases: [],
  members: [{ name: "你", roles: ["OWNER"] }],
  assets: [{ name: "reading-list.md", mime: "text/markdown", size: "3 KB", state: "QUARANTINED", dataClass: "PRIVATE" }],
  runs: [],
  ownedByViewer: true,
};

export const platformProjects: readonly PlatformProject[] = [aiGenerator, volume, sorting, typeSpecimen, airQuality, notes];

export const sampleGrants: readonly ProjectGrant[] = [
  { id: "grant_1", project: "城市空气质量摘要", projectSlug: "air-quality", capability: "summary.read.async", scope: "仅城市与日期 · 每日 20 次", expires: "示例 · 2026-11-30", status: "ACTIVE", dataFlow: "developer" },
  { id: "grant_2", project: "体数据三维重建", projectSlug: "volume-reconstruction", capability: "inference.reconstruction.async", scope: "仅合成样例", expires: "示例 · 2026-11-12", status: "ACTIVE", dataFlow: "developer" },
  { id: "grant_3", project: "排序算法对照实验", projectSlug: "sorting-lab", capability: "presentation.read", scope: "公开内容", expires: "长期", status: "ACTIVE", dataFlow: "none" },
  { id: "grant_4", project: "城市空气质量摘要", projectSlug: "air-quality", capability: "summary.read.async", scope: "旧版本 0.1.0", expires: "示例 · 2026-10-01", status: "EXPIRED", dataFlow: "developer" },
];

export const sampleCredentials: readonly ProviderCredential[] = [
  { id: "cred_1", provider: "OpenAI-compatible", label: "示例 · 个人密钥", hint: "••••••••7Q2c", models: ["由你选择的模型"], scope: "仅 AI Hub 对话", status: "ACTIVE" },
];
