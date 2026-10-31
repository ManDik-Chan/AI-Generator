/*
 * Registry release previews for the Showcase (P1-D2-A).
 *
 * Each entry holds a FIXTURE shaped exactly like the future public projection
 * (`ReleaseDTO` in features/registry/contracts.ts — a unit test parses every fixture with
 * `releaseDTOSchema`). Nothing here reads Registry data: the public read
 * `getPublicRegistryRelease` still answers NOT_FOUND for every input, so these pages must
 * never present a fixture as a published release. When public projection opens, replace
 * `getShowcaseRelease` with a call to it; the components take the same `ReleaseDTO`.
 *
 * The content describes the two real demos honestly: claims stay at SOURCE_IMPLEMENTED,
 * DOCUMENTED or PLANNED (no EXPERIMENT_VERIFIED without evidence assets) and every metric
 * is UNPUBLISHED. The asset ids are placeholders; no asset can be delivered yet.
 */
import type { ArtKey } from "@/features/landing/art";
import type { ReleaseDTO } from "@/features/registry/contracts";

export type ShowcaseDemoSlug = "route-optimizer" | "neural-network";

export interface ShowcaseRelease {
  /** Explore slug of the project page this preview belongs to. */
  slug: ShowcaseDemoSlug;
  /** Always "fixture" until the Registry public projection exists. */
  source: "fixture";
  art: ArtKey;
  /** Where the content's facts come from, shown to readers. */
  basis: string;
  /** Readable pages on this site for documentation whose Registry assets cannot be served yet. */
  siteDocs: { title: string; href: string }[];
  release: ReleaseDTO;
}

/** Placeholder only: a fixture needs a syntactically valid timestamp, but nothing was published. */
const FIXTURE_PUBLISHED_AT = "2026-10-30T00:00:00.000Z";

const routeOverview = `路线优化求解器为 3–400 个城市求一条尽量短的闭合路线。请求经过公开的 Demo API 进入服务端，在协作式时间片里运行构造与改进策略，并以 JSON 或事件流返回结果。

- **构造**：最近邻，或带种子的随机构造。
- **改进**：2-opt、Or-opt、模拟退火 + 2-opt 打磨。
- **下界**：用 Prim 最小生成树给出“距最优至多多少”的上界，随结果一起返回。

截止时间到达时返回当前最好的部分结果，而不是报错。`;

const routeArchitecture = `### 执行路径

1. \`POST /api/demo/v1/runs\` 校验请求体（64 KiB 上限）并按客户端限流。
2. \`executeRun\` 状态机以 25 ms 为一片推进计算，每片之间检查取消与截止时间。
3. 结果以单个 JSON 或 \`text/event-stream\` 返回；事件流按阶段推送进度。

### 尚未实现

异步运行（202 + 轮询）、共享存储限流，以及在 Registry 中登记这个能力。`;

const nnOverview = `神经网络训练场在访客的浏览器里真实训练一个多层感知机。数据集在本机按种子生成，训练在 Web Worker 中用反向传播进行，页面实时绘制决策边界、损失曲线和网络权重。

- **优化器**：SGD、Momentum、Adam，可选 L2 正则。
- **协议**：页面与 Worker 之间使用 \`aig.worker/1\` 消息协议，每条消息都经过 zod 校验。
- **数据**：训练数据只存在于访客设备上，不上传。`;

const nnArchitecture = `### 三层结构

1. **页面**：\`useNeuralTrainer\` reducer 管理状态，Canvas 绘制决策边界，SVG 绘制网络与损失曲线。
2. **协议**：\`session.configure\`、\`run.start\`、\`run.cancel\` 三类命令，Worker 回传指标与权重。
3. **Worker**：带种子的数据集、前向与反向传播、优化器实现。

### 尚未实现

L1 独立 origin 的 iframe 沙箱，以及第三方 Worker 能力注册。`;

export const showcaseReleases: readonly ShowcaseRelease[] = [
  {
    slug: "route-optimizer",
    source: "fixture",
    art: "tide",
    basis: "依据仓库中已合并的路线优化 Demo 与它的 API 文档编写。",
    siteDocs: [
      { title: "API Reference · route-optimizer.solve", href: "/docs/api#route-optimizer-solve" },
      { title: "开发者手册 · 服务端能力", href: "/docs/guide#服务端能力" },
    ],
    release: {
      schemaVersion: "0.5.0",
      projectId: "8f3c2a71-5d4e-4b6a-9c1f-2e7d0a4b8c15",
      releaseId: "c1a4e9d2-7b3f-4e8a-a5d6-0f2b9c7e1d43",
      version: "1.0.0",
      name: "路线优化求解器",
      summary: "服务端真实求解的旅行商问题：四种策略、截止时间、实时进度与可证明的下界。",
      visibility: "PUBLIC",
      publishedAt: FIXTURE_PUBLISHED_AT,
      presentation: {
        schemaVersion: "0.5.0",
        projectId: "8f3c2a71-5d4e-4b6a-9c1f-2e7d0a4b8c15",
        version: "1.0.0",
        title: "路线优化求解器",
        sections: [
          { id: "overview", kind: "MARKDOWN", title: "概览", body: routeOverview, sourceAssetIds: [] },
          { id: "route-figure", kind: "IMAGE", title: "一次求解的路线", assetId: "3e9b7c1d-2a4f-4d6e-8b0c-5f1a2d3e4c76", alt: "120 个城市的闭合路线，改进后的边以高亮显示" },
          { id: "architecture", kind: "MARKDOWN", title: "架构", body: routeArchitecture, sourceAssetIds: [] },
          {
            id: "benchmarks",
            kind: "BENCHMARKS",
            title: "基准",
            metrics: [
              { name: "距最优上界（gap）", status: "UNPUBLISHED" },
              { name: "求解耗时", status: "UNPUBLISHED" },
            ],
          },
        ],
      },
      documentation: [{ id: "5b2d8e4f-1c7a-4f9b-b3e6-7a0c2d9f8e11", title: "API Reference · route-optimizer.solve", language: "zh", assetId: "9d4f1a6c-3e8b-4c2d-a7f5-1b6e0c3d2a98" }],
      researchClaims: [
        { topic: "可证明的质量上界", status: "SOURCE_IMPLEMENTED", description: "每次运行都用 Prim 最小生成树计算下界，并返回 length / MST − 1 作为距最优的上界。", evidenceAssetIds: [] },
        { topic: "截止时间返回部分结果", status: "SOURCE_IMPLEMENTED", description: "协作式时间片在截止时间到达时停止改进，返回当前最好的路线与统计。", evidenceAssetIds: [] },
        { topic: "异步运行", status: "PLANNED", description: "202 Accepted 加轮询的异步运行仍在设计中，当前只支持同步与事件流。", evidenceAssetIds: [] },
      ],
    },
  },
  {
    slug: "neural-network",
    source: "fixture",
    art: "bloom",
    basis: "依据仓库中已合并的神经网络 Demo 与浏览器运行时文档编写。",
    siteDocs: [{ title: "开发者手册 · 浏览器运行时", href: "/docs/guide#浏览器运行时" }],
    release: {
      schemaVersion: "0.5.0",
      projectId: "2c7e5a9f-4b1d-4e3c-8f6a-0d9b2e7c4a51",
      releaseId: "e6b3d1f8-9a2c-4d7e-b4f0-3c8a5e1d6b27",
      version: "1.0.0",
      name: "神经网络训练场",
      summary: "在浏览器里真实训练的小型神经网络：反向传播、三种优化器、实时决策边界。",
      visibility: "PUBLIC",
      publishedAt: FIXTURE_PUBLISHED_AT,
      presentation: {
        schemaVersion: "0.5.0",
        projectId: "2c7e5a9f-4b1d-4e3c-8f6a-0d9b2e7c4a51",
        version: "1.0.0",
        title: "神经网络训练场",
        sections: [
          { id: "overview", kind: "MARKDOWN", title: "概览", body: nnOverview, sourceAssetIds: [] },
          { id: "architecture", kind: "MARKDOWN", title: "架构", body: nnArchitecture, sourceAssetIds: [] },
          {
            id: "benchmarks",
            kind: "BENCHMARKS",
            title: "基准",
            metrics: [
              { name: "测试集准确率", status: "UNPUBLISHED" },
              { name: "单轮训练耗时", status: "UNPUBLISHED" },
            ],
          },
        ],
      },
      documentation: [{ id: "7f1c4e9a-2d6b-4a8f-9e3c-5b0d7a2f1c64", title: "浏览器运行时与 aig.worker/1 协议", language: "zh", assetId: "4a8d2f6c-1e9b-4c3a-8d7f-6e2b0a5c9d13" }],
      researchClaims: [
        { topic: "浏览器内反向传播", status: "SOURCE_IMPLEMENTED", description: "多层感知机的前向、反向传播与三种优化器都在 Web Worker 中实现并运行。", evidenceAssetIds: [] },
        { topic: "训练数据不出设备", status: "DOCUMENTED", description: "数据集在访客设备上按种子生成，页面与 Worker 之间只传递指标与权重。", evidenceAssetIds: [] },
        { topic: "独立 origin 沙箱", status: "PLANNED", description: "第三方 Worker 能力需要 L1 独立 origin 的 iframe 沙箱，尚未实现。", evidenceAssetIds: [] },
      ],
    },
  },
];

/** The release preview for an Explore slug, from fixtures only. */
export function getShowcaseRelease(slug: string): ShowcaseRelease | undefined {
  return showcaseReleases.find((entry) => entry.slug === slug);
}

export function showcaseReleaseSlugs(): ShowcaseDemoSlug[] {
  return showcaseReleases.map((entry) => entry.slug);
}
