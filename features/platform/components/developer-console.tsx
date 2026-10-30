import Link from "next/link";
import { FolderPlus } from "lucide-react";

import type { ShellMode } from "@/components/layout/navigation";
import { ArrowLink, DemoNotice, PageIntro, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { ManifestValidator } from "@/features/platform/components/manifest-validator";
import { runStatusMeta } from "@/features/platform/labels";
import type { CapabilityStatus } from "@/features/platform/status";
import { cn } from "@/lib/utils";

const levels: { level: string; title: string; detail: string; status: CapabilityStatus | "excluded" }[] = [
  { level: "L0", title: "展示", detail: "成果页、文档、模型卡与静态资产。不执行任何外部代码。", status: "dev" },
  { level: "L1", title: "受控嵌入", detail: "独立 origin 的 iframe 沙箱与严格的消息协议，不共享 Cookie 或 Token。", status: "planned" },
  { level: "L2", title: "远程 API", detail: "OpenAPI 契约 + 平台任务代理：授权、上传、状态与结果都经过平台。", status: "planned" },
  { level: "L3", title: "平台托管运行", detail: "隔离容器与 GPU 预算。V1 明确不实施。", status: "excluded" },
];

const endpoints: [string, string, string][] = [
  ["GET", "/api/v1/projects", "公开或已授权的项目列表"],
  ["GET", "/api/v1/projects/{projectId}", "读取项目（服务端授权）"],
  ["GET", "/api/v1/projects/{projectId}/versions/{version}", "读取不可变版本"],
  ["POST", "/api/v1/projects/{projectId}/installations", "安装项目"],
  ["POST", "/api/v1/installations/{id}/grants", "授予能力"],
  ["DELETE", "/api/v1/grants/{grantId}", "撤销授权，新的运行立即被拒绝"],
  ["POST", "/api/v1/projects/{projectId}/runs", "创建运行 · 202 Accepted + runId · Idempotency-Key"],
  ["GET", "/api/v1/runs/{runId}", "读取运行状态"],
  ["POST", "/api/v1/runs/{runId}/cancel", "取消运行"],
  ["POST", "/api/v1/runs/{runId}/artifacts/upload-intents", "短时上传意图，对象存储直传"],
];

const methodTone = { GET: "info", POST: "lime", DELETE: "danger" } as const;

const contracts: [string, string][] = [
  ["manifest.schema.json", "项目清单：slug、版本、类别、可见性、能力与研究声明"],
  ["presentation.schema.json", "展示区块：Markdown、图片与基准（未发布 / 已报告）"],
  ["release.schema.json", "发布与撤回：不可覆盖、不可复活"],
  ["p1.openapi.json", "P1 Registry 接口草案"],
];

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
      <p className="mt-4 text-[.75rem] leading-5 text-muted-foreground">终态不可逆且幂等；重复回调、竞态取消与超时都必须落到唯一终态。第三方回调需要签名身份与重放防护。</p>
    </div>
  );
}

export function DeveloperConsole({ mode }: { mode: ShellMode }) {
  const projects = mode === "demo" ? "/platform/projects" : "/projects";
  return (
    <div className="pb-6">
      <PageIntro
        actions={<Button asChild size="lg"><Link href={`${projects}/new`} prefetch={false}><FolderPlus className="size-4" />用向导生成 Manifest</Link></Button>}
        description="开发者在这里准备 Manifest、阅读契约、了解发布与运行规则。现在就能用的是浏览器内的 Manifest 校验；版本发布、端点注册与远程运行仍在开发或规划中。"
        kicker="开发者 · Developer"
        meta={<StatusPill status="dev" />}
        title={["先有契约，", "再有运行。"]}
      />

      <div className="mb-14 grid gap-0.5 min-[821px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-card bg-surface p-5">
          <p className="flex flex-wrap items-center gap-2 text-[.75rem] text-muted-foreground"><ToneBadge dot tone="success">已上线</ToneBadge>开发者文档与可运行 Demo</p>
          <p className="mt-3 text-[1.25rem] font-medium leading-snug tracking-[-.02em]">完整的开发者手册、API Reference 与两个可直接运行的参考实现已经公开。</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <ArrowLink href="/docs">开发者文档</ArrowLink>
            <ArrowLink href="/docs/api">API Reference</ArrowLink>
            <ArrowLink href="/demos">运行 Demo</ArrowLink>
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-card bg-surface p-5">
          <p className="font-code text-[.75rem] text-muted-foreground">POST /api/demo/v1/runs</p>
          <p className="mt-3 text-[.8125rem] leading-5 text-muted-foreground">Demo 运行接口已实现并公开（同步执行，可选事件流）。下方的“平台 API”仍是设计契约，尚未部署。</p>
        </div>
      </div>

      <section aria-labelledby="dev-manifest" className="scroll-mt-28" id="manifest">
        <SectionHead id="dev-manifest" meta={<ToneBadge tone="success">可用 · 浏览器内</ToneBadge>}>Manifest 校验</SectionHead>
        <ManifestValidator />
      </section>

      <section aria-labelledby="dev-levels" className="mt-20">
        <SectionHead id="dev-levels">接入等级</SectionHead>
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

      <section aria-labelledby="dev-lifecycle" className="mt-20">
        <SectionHead id="dev-lifecycle">运行状态机</SectionHead>
        <Lifecycle />
      </section>

      <section aria-labelledby="dev-api" className="mt-20">
        <SectionHead id="dev-api" meta={<ToneBadge tone="warning">拟议 · 尚未实现</ToneBadge>}>平台 API</SectionHead>
        <DemoNotice className="mb-5" label="接口草案">以下路径来自平台规划，用于讨论与评审；它们还不存在，调用会得到 404。所有接口都在服务端校验所有者、版本与授权。</DemoNotice>
        <ul className="border-t border-border/12">
          {endpoints.map(([method, path, detail]) => (
            <li className="grid gap-x-4 gap-y-1 border-b border-border/12 py-3 min-[821px]:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1fr)] min-[821px]:items-center" key={`${method}${path}`}>
              <span><ToneBadge className="font-code" tone={methodTone[method as keyof typeof methodTone]}>{method}</ToneBadge></span>
              <span className="break-all font-code text-[.8125rem]">{path}</span>
              <span className="text-[.8125rem] text-muted-foreground">{detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dev-contracts" className="mt-20">
        <SectionHead id="dev-contracts" meta={<span className="text-caption">P0.5 契约草案 · 尚未合并到 main</span>}>契约文件</SectionHead>
        <ul className="grid gap-0.5 min-[640px]:grid-cols-2">
          {contracts.map(([file, detail]) => (
            <li className="flex min-h-[7rem] flex-col rounded-card bg-surface p-4" key={file}>
              <span className="font-code text-[.8125rem] font-medium">{file}</span>
              <span className="mt-auto pt-4 text-[.8125rem] leading-5 text-muted-foreground">{detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
