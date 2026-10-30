import type { Metadata } from "next";

import { demos, sourceUrl } from "@/features/demos/catalog";
import { DemoPageHeader, HowItWorks } from "@/features/demos/components/demo-page";
import { NeuralNetworkDemo } from "@/features/demos/neural-network/components/neural-network-demo";

const demo = demos[1];

export const metadata: Metadata = {
  title: demo.name,
  description: demo.tagline,
};

export default function NeuralNetworkPage() {
  return (
    <div className="mx-auto max-w-[100rem] px-4 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10">
      <DemoPageHeader demo={demo} docsHref="/docs/guide#浏览器运行时" />
      <NeuralNetworkDemo />
      <HowItWorks
        boundary="数据集在你的浏览器里按种子生成，训练在 Web Worker 中进行，不向服务器发送任何训练数据或结果；无法启动 Worker 时会改在主线程运行并注明。单次运行最长 60 秒。网络规模刻意很小（最多 4 层 × 8 个神经元），用于展示原理，不是生产模型。"
        links={[
          { href: "/docs/guide#浏览器运行时", label: "aig.worker/1 协议" },
          { href: "/docs/api#capabilities", label: "能力描述符" },
          { href: sourceUrl(demo.sourcePath), label: "查看源码", external: true },
        ]}
        steps={[
          ["页面只发消息", "页面向 Worker 发送 session.configure 与 run.start；每条消息都带协议版本，Worker 逐条按契约校验，不合格的消息只会得到 protocol.error。"],
          ["Worker 真实训练", "前向传播、交叉熵与反向传播都在 Worker 里用 TypeScript 计算；每 16 ms 让出一次，按节流推送指标、决策边界网格与权重。"],
          ["同一套运行状态", "运行同样经过 ACCEPTED → RUNNING → 终态：训练完成为 SUCCEEDED，你点停止为 CANCELLED，损失变为非有限值为 FAILED / DIVERGED。"],
        ]}
      />
    </div>
  );
}
