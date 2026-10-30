import type { Metadata } from "next";

import { demos, sourceUrl } from "@/features/demos/catalog";
import { DemoPageHeader, HowItWorks } from "@/features/demos/components/demo-page";
import { RouteOptimizerDemo } from "@/features/demos/route-optimizer/components/route-optimizer-demo";

const demo = demos[0];

export const metadata: Metadata = {
  title: demo.name,
  description: demo.tagline,
};

export default function RouteOptimizerPage() {
  return (
    <div className="mx-auto max-w-[100rem] px-4 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10">
      <DemoPageHeader demo={demo} docsHref="/docs/api#route-optimizer-solve" />
      <RouteOptimizerDemo />
      <HowItWorks
        boundary="求解在平台服务端真实执行，输入只用于这次计算，不写入数据库或日志。限流（每个客户端 60 秒 20 次、同时 2 个运行）按函数实例计算，是尽力而为的第一道防线；单次运行最长 5 秒。这是 Demo 专用接口，不是已上线的 Registry 或远程运行（L2）生产接口。"
        links={[
          { href: "/docs/api#route-optimizer-solve", label: "API Reference" },
          { href: "/docs/guide#服务端能力", label: "如何写一个服务端能力" },
          { href: sourceUrl(demo.sourcePath), label: "查看源码", external: true },
        ]}
        steps={[
          ["校验，再执行", "POST /api/demo/v1/runs 先检查限流、Content-Type、体积（≤ 64 KiB）和输入契约；不合格的请求得到 4xx 与稳定的错误码，不会产生运行。"],
          ["在截止时间内求解", "求解器以 25 ms 为一片工作：每片之间推送当前最好路线、让出事件循环并检查客户端是否断开；到截止时间立即返回已有的最好结果。"],
          ["同一套运行状态", "PENDING → ACCEPTED → RUNNING → SUCCEEDED / TIMED_OUT / CANCELLED / FAILED，与平台规划的远程运行状态机一致，终态不可逆。"],
        ]}
      />
    </div>
  );
}
