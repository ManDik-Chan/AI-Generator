/*
 * The two runnable demos as the site presents them: one entry each for the /demos index,
 * the landing page, Explore and the developer docs. Facts here must match the
 * capability descriptors in features/demos/runtime/registry.ts (a unit test checks).
 */
import type { ArtKey } from "@/features/landing/art";

export interface DemoEntry {
  slug: "route-optimizer" | "neural-network";
  index: string;
  name: string;
  english: string;
  tagline: string;
  capability: string;
  execution: "server" | "browser";
  art: ArtKey;
  href: string;
  facts: [string, string][];
  tryList: string[];
  sourcePath: string;
}

export const demos: DemoEntry[] = [
  {
    slug: "route-optimizer",
    index: "01",
    name: "路线优化求解器",
    english: "Route Optimizer",
    tagline: "在服务端为几十到 400 个城市求一条尽量短的闭合路线，进度通过事件流实时推送。",
    capability: "route-optimizer.solve",
    execution: "server",
    art: "tide",
    href: "/demos/route-optimizer",
    facts: [
      ["执行位置", "平台服务端（Vercel Function）"],
      ["接口", "POST /api/demo/v1/runs · JSON 或 SSE"],
      ["算法", "最近邻 · 2-opt · Or-opt · 模拟退火"],
      ["数据", "只用于本次计算，不保存"],
    ],
    tryList: ["切换四种点集与四种改进策略", "把截止时间调到 50 ms，看 TIMED_OUT 如何返回最好结果", "运行中取消，或一次对比全部策略"],
    sourcePath: "features/demos/route-optimizer",
  },
  {
    slug: "neural-network",
    index: "02",
    name: "神经网络训练场",
    english: "Neural Network",
    tagline: "在你的浏览器里用反向传播训练一个小型神经网络，实时看决策边界和损失曲线如何变化。",
    capability: "neural-network.train",
    execution: "browser",
    art: "bloom",
    href: "/demos/neural-network",
    facts: [
      ["执行位置", "你的浏览器（Web Worker）"],
      ["接口", "aig.worker/1 消息协议"],
      ["算法", "多层感知机 · SGD / Momentum / Adam"],
      ["数据", "在本机生成，从不上传"],
    ],
    tryList: ["在双螺旋上从 0 层加到 4 层隐藏层", "对比原始特征与二次特征", "把学习率拉高，观察训练是否失稳"],
    sourcePath: "features/demos/neural-network",
  },
];

export const REPO_URL = "https://github.com/ManDik-Chan/AI-Generator";

/** Link to a repository path at the deployed commit when known, otherwise main. */
export function sourceUrl(path: string) {
  const ref = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "main";
  return `${REPO_URL}/tree/${ref}/${path}`;
}
