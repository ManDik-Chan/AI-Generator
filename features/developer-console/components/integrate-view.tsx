import { ArrowLink, DemoNotice, PageIntro, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { examples } from "@/features/demos/runtime/openapi-examples";
import { designedEndpoints, liveOperations, registryFunctions, type HttpMethod } from "@/features/developer-console/api-catalog";
import { actionMeta, contractMeta, requiredRoles, roleLabels, type ContractStatus } from "@/features/developer-console/permissions";
import { ManifestValidator } from "@/features/platform/components/manifest-validator";
import { runStatusMeta } from "@/features/platform/labels";
import type { CapabilityStatus } from "@/features/platform/status";
import { cn } from "@/lib/utils";

const methodTone: Record<HttpMethod, "info" | "lime" | "danger"> = { GET: "info", POST: "lime", DELETE: "danger" };
const contractTone: Record<ContractStatus, "success" | "warning" | "neutral"> = { merged: "success", provisional: "warning", gap: "neutral" };

const levels: { level: string; title: string; detail: string; status: CapabilityStatus | "excluded" }[] = [
  { level: "L0", title: "展示", detail: "成果页、文档、模型卡与静态资产。不执行任何外部代码。Manifest 0.5.0 只接受这一级。", status: "dev" },
  { level: "L1", title: "受控嵌入", detail: "独立 origin 的 iframe 沙箱与严格的消息协议，不共享 Cookie 或 Token。", status: "planned" },
  { level: "L2", title: "远程 API", detail: "OpenAPI 契约 + 平台任务代理：授权、上传、状态与结果都经过平台。", status: "planned" },
  { level: "L3", title: "平台托管运行", detail: "隔离容器与 GPU 预算。V1 明确不实施。", status: "excluded" },
];

const contracts: { file: string; detail: string; status: ContractStatus }[] = [
  { file: "features/registry/contracts.ts", detail: "DraftDTO · VersionDTO 严格 zod 契约；ReleaseDTO 仅为未来投影的边界 schema", status: "merged" },
  { file: "features/registry/canonical.ts", detail: "JCS-SHA256-v1：RFC 8785 规范化 + SHA-256，含跨语言固定向量", status: "merged" },
  { file: "docs/developer/contracts/manifest.schema.json", detail: "Manifest 0.5.0 JSON Schema（P0.5 契约副本）", status: "merged" },
  { file: "docs/developer/openapi.json", detail: "Demo Runtime API 的 OpenAPI 3.1，由 zod 生成并校验", status: "merged" },
  { file: "docs/registry-b2b-release-contracts.md", detail: "Release 命令与公开投影草案；所在分支尚未合并", status: "provisional" },
];

function Code({ children }: { children: string }) {
  return <pre className="mt-3 whitespace-pre-wrap rounded-control bg-foreground p-4 font-code text-[.75rem] leading-5 text-background [overflow-wrap:anywhere]"><code>{children}</code></pre>;
}

function Lifecycle() {
  const main = ["PENDING", "ACCEPTED", "RUNNING"] as const;
  const terminal = ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;
  return (
    <div className="rounded-card bg-surface p-5">
      <div className="flex flex-col gap-3 min-[821px]:flex-row min-[821px]:items-center">
        <ol className="flex flex-wrap items-center gap-2">
          {main.map((status, index) => (
            <li className="flex items-center gap-2" key={status}>
              <span className="rounded-full bg-surface-raised px-3 py-1.5 font-code text-[.75rem] shadow-[inset_0_0_0_1px_hsl(var(--border)/.1)]">{status}</span>
              {index < main.length - 1 ? <span aria-hidden="true" className="text-muted-foreground">→</span> : null}
            </li>
          ))}
        </ol>
        <span aria-hidden="true" className="text-muted-foreground max-[820px]:rotate-90 max-[820px]:self-start">→</span>
        <ul className="flex flex-wrap gap-1.5">
          {terminal.map((status) => <li key={status}><ToneBadge tone={runStatusMeta[status].tone}>{status}</ToneBadge></li>)}
        </ul>
      </div>
      <p className="mt-4 text-[.75rem] leading-5 text-muted-foreground">两个 Demo 共用这一状态机：终态不可逆且幂等，截止时间返回 TIMED_OUT（可带部分结果），客户端断开得到 CANCELLED。正式的 202 异步运行沿用同样的状态语义。</p>
    </div>
  );
}

/** Developer onboarding and the status of every interface, by what you can rely on today. */
export function IntegrateView({ base }: { base: string }) {
  const live = liveOperations();
  const runBody = JSON.stringify(examples.requests.instance);
  const steps = [
    { title: "列出可运行的能力", detail: "公开接口，无需登录或 API Key。返回两个能力描述符（aig.capability/0.1）。", code: "curl -s https://<站点域名>/api/demo/v1/capabilities" },
    { title: "发起一次真实运行", detail: "同步返回终态 Run；加 Accept: text/event-stream 可接收生命周期与进度事件。", code: `curl -s -X POST https://<站点域名>/api/demo/v1/runs \\\n  -H 'Content-Type: application/json' \\\n  -d '${runBody}'` },
  ];

  return (
    <div className="pb-6">
      <PageIntro
        description="先用已经上线的 Demo API 打通调用，再按 Manifest 0.5.0 准备项目内容。Registry 目前只有服务端内部库，没有 HTTP 接口；设计中的接口调用会得到 404。"
        kicker="接入 · Integrate"
        meta={<StatusPill status="dev" />}
        title={["接入只依赖", "已经公开的契约。"]}
      />

      <section aria-labelledby="in-steps">
        <SectionHead id="in-steps" action={<ArrowLink href="/docs/guide">完整开发者手册</ArrowLink>}>四步接入</SectionHead>
        <ol className="grid gap-0.5 min-[1024px]:grid-cols-2">
          {steps.map((step, index) => (
            <li className="min-w-0 rounded-card bg-surface p-5" key={step.title}>
              <p className="flex items-center gap-2"><span className="font-code text-[.75rem] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><span className="text-sm font-medium">{step.title}</span><ToneBadge tone="success">可用</ToneBadge></p>
              <p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">{step.detail}</p>
              <Code>{step.code}</Code>
            </li>
          ))}
          <li className="min-w-0 rounded-card bg-surface p-5">
            <p className="flex items-center gap-2"><span className="font-code text-[.75rem] text-muted-foreground">03</span><span className="text-sm font-medium">校验 Manifest</span><ToneBadge tone="success">浏览器内</ToneBadge></p>
            <p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">按 0.5.0 契约检查必填字段、未知字段与研究声明；内容不会上传。也可以本地运行 <span className="font-code">pnpm manifest:validate</span>。</p>
            <ArrowLink className="mt-3" href="#manifest">跳到校验器</ArrowLink>
          </li>
          <li className="min-w-0 rounded-card bg-surface p-5">
            <p className="flex items-center gap-2"><span className="font-code text-[.75rem] text-muted-foreground">04</span><span className="text-sm font-medium">在发布台走一遍流程</span><ToneBadge tone="warning">Mock</ToneBadge></p>
            <p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">草稿、独立审核、封存与发布的完整规则；切换身份，观察 ETag、幂等键和每一种拒绝。</p>
            <ArrowLink className="mt-3" href={`${base}/projects/sorting-lab`}>打开发布台</ArrowLink>
          </li>
        </ol>
      </section>

      <section aria-labelledby="in-manifest" className="mt-20 scroll-mt-28" id="manifest">
        <SectionHead id="in-manifest" meta={<ToneBadge tone="success">可用 · 浏览器内</ToneBadge>}>Manifest 校验</SectionHead>
        <ManifestValidator />
      </section>

      <section aria-labelledby="in-live" className="mt-20 scroll-mt-28" id="live">
        <SectionHead id="in-live" meta={<ToneBadge dot tone="success">已上线 · 公开</ToneBadge>} action={<ArrowLink href="/docs/api">在线请求</ArrowLink>}>Demo Runtime API</SectionHead>
        <ul className="border-t border-border/12">
          {live.map((operation) => (
            <li className="grid gap-x-4 gap-y-1 border-b border-border/12 py-3 min-[821px]:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1fr)] min-[821px]:items-center" key={`${operation.method}${operation.path}`}>
              <span><ToneBadge className="font-code" tone={methodTone[operation.method]}>{operation.method}</ToneBadge></span>
              <span className="break-all font-code text-[.8125rem]">{operation.path}</span>
              <span className="text-[.8125rem] text-muted-foreground">{operation.summary} <span className="font-code text-[.6875rem]">· {operation.operationId}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[.75rem] text-muted-foreground">由 Demo OpenAPI 生成器直接读取。限流按函数实例计数：每客户端 60 秒 20 次、并发 2；请求体 64 KiB；单次运行 5 秒。</p>
      </section>

      <section aria-labelledby="in-registry" className="mt-20 scroll-mt-28" id="registry">
        <SectionHead id="in-registry" meta={<ToneBadge tone="info">服务端内部库 · 无 HTTP</ToneBadge>}>Registry 协议</SectionHead>
        <DemoNotice className="mb-5" label="尚无 HTTP 接口">这些函数只能在服务端调用，默认由环境开关关闭。发布台用 Mock Adapter 复现它们的规则；接入真实接口时只替换 Adapter，界面不变。</DemoNotice>
        <div className="scroll-x">
          <table className="w-full min-w-[46rem] border-collapse text-left text-[.8125rem]">
            <thead>
              <tr className="border-b border-border/12 text-[.75rem] text-muted-foreground">
                <th className="py-2.5 pr-4 font-medium" scope="col">函数</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">动作 · 项目角色</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">说明</th>
                <th className="py-2.5 font-medium" scope="col">契约</th>
              </tr>
            </thead>
            <tbody>
              {registryFunctions.map((item) => (
                <tr className="border-b border-border/10 align-top" key={item.fn}>
                  <th className="py-3 pr-4 font-normal" scope="row"><span className="font-code text-[.75rem] font-medium">{item.fn}</span><span className="mt-0.5 block font-code text-[.6875rem] text-muted-foreground">{item.file}</span></th>
                  <td className="py-3 pr-4 text-[.75rem]">
                    <span className="font-code">{item.action}</span>
                    <span className="mt-0.5 block text-muted-foreground">{item.action === "CREATE_PROJECT" ? "内部创建资格" : requiredRoles(item.action).map((role) => roleLabels[role]).join(" / ")}</span>
                  </td>
                  <td className="py-3 pr-4 text-[.75rem] text-muted-foreground">{item.detail}{item.action !== "CREATE_PROJECT" && actionMeta[item.action].independence ? ` · ${actionMeta[item.action].independence}` : ""}</td>
                  <td className="py-3"><ToneBadge tone={contractTone[item.contract]}>{contractMeta[item.contract].label}</ToneBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="in-designed" className="mt-20 scroll-mt-28" id="designed">
        <SectionHead id="in-designed" meta={<ToneBadge tone="neutral">设计中 · 尚未实现</ToneBadge>}>平台 API 草案</SectionHead>
        <ul className="border-t border-border/12">
          {designedEndpoints.map((endpoint) => (
            <li className="grid gap-x-4 gap-y-1 border-b border-border/12 py-3 opacity-80 min-[821px]:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1fr)] min-[821px]:items-center" key={`${endpoint.method}${endpoint.path}`}>
              <span><ToneBadge className="font-code" tone="neutral">{endpoint.method}</ToneBadge></span>
              <span className="break-all font-code text-[.8125rem]">{endpoint.path}</span>
              <span className="text-[.8125rem] text-muted-foreground">{endpoint.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[.75rem] text-muted-foreground">来自平台规划，用于评审，现在调用会得到 404。所有接口都将在服务端校验身份、版本与授权。</p>
      </section>

      <section aria-labelledby="in-levels" className="mt-20">
        <SectionHead id="in-levels">接入等级</SectionHead>
        <div className="grid gap-0.5 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {levels.map((item, index) => (
            <div className={cn("enter flex min-h-[13rem] flex-col rounded-card p-5", item.status === "excluded" ? "demo-outline" : "bg-surface")} key={item.level} style={delay(60 + index * 60)}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[clamp(2rem,3vw,2.6rem)] font-medium leading-none tracking-[-.05em]">{item.level}</span>
                {item.status === "excluded" ? <ToneBadge tone="neutral">V1 不实施</ToneBadge> : <StatusPill status={item.status} />}
              </span>
              <span className="mt-auto pt-8 text-[1.0625rem] font-medium tracking-[-.015em]">{item.title}</span>
              <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{item.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="in-lifecycle" className="mt-20">
        <SectionHead id="in-lifecycle">运行状态机</SectionHead>
        <Lifecycle />
      </section>

      <section aria-labelledby="in-contracts" className="mt-20">
        <SectionHead id="in-contracts">契约文件</SectionHead>
        <ul className="grid gap-0.5 min-[640px]:grid-cols-2">
          {contracts.map((item) => (
            <li className="flex min-h-[7rem] flex-col rounded-card bg-surface p-4" key={item.file}>
              <span className="flex flex-wrap items-start justify-between gap-2"><span className="break-all font-code text-[.8125rem] font-medium">{item.file}</span><ToneBadge tone={contractTone[item.status]}>{contractMeta[item.status].label}</ToneBadge></span>
              <span className="mt-auto pt-4 text-[.8125rem] leading-5 text-muted-foreground">{item.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
