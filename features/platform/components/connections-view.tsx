import { KeyRound, Plus, Server, ShieldCheck } from "lucide-react";

import type { ShellMode } from "@/components/layout/navigation";
import { DemoNotice, PageIntro, SampleTag, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { Button } from "@/components/ui/button";
import { GrantsTable } from "@/features/platform/components/grants-table";
import type { ProjectGrant, ProviderCredential } from "@/features/platform/types";

const principles: [string, string][] = [
  ["不交给项目作者", "开发者只能经平台代理调用，永远拿不到原始密钥。"],
  ["不静默切换", "你选定的凭据失败时直接报错，不会悄悄换成平台密钥或其他服务。"],
  ["随时撤销", "解绑或轮换后，新的调用立即失效。"],
  ["费用分开显示", "平台运行额度与模型提供方的账单分开记录。"],
];

const processors: [string, string, string][] = [
  ["AI Hub 对话与工具", "平台服务端 + 你选定的模型提供方", "生成回答；人格 Prompt 只在服务端拼装"],
  ["长期记忆", "平台数据库", "仅在你确认后写入，用于后续对话召回"],
  ["生成与上传的图片", "平台私有存储", "仅你可读；图片理解的上传原图会到期清理"],
  ["项目运行（L2，规划）", "项目运营方的服务", "每次运行前单独告知并征得同意"],
];

export function ConnectionsView({ mode, grants, credentials }: { mode: ShellMode; grants: ProjectGrant[]; credentials: ProviderCredential[] }) {
  return (
    <div className="pb-6">
      <PageIntro
        description="模型凭据、项目授权与数据去向集中在这里。它们彼此独立：授权一个项目不等于把你的凭据交给它，公开一个项目也不等于公开你的数据。"
        kicker="连接与授权 · Connections"
        meta={<StatusPill status="planned" />}
        title={["你的凭据与授权，", "一处可见，随时撤销。"]}
      />
      <DemoNotice className="mb-14">凭据网关（BYOK）与项目授权仍在安全设计阶段。本页展示它们将如何呈现；这里没有任何可以接收密钥的输入框，也不会保存更改。</DemoNotice>

      <section aria-labelledby="cx-models">
        <SectionHead id="cx-models">模型凭据</SectionHead>
        <div className="grid gap-0.5 min-[821px]:grid-cols-2">
          <div className="flex min-h-[13rem] flex-col rounded-card bg-foreground p-5 text-background">
            <span className="flex items-center justify-between gap-2"><Server aria-hidden="true" className="size-5" /><ToneBadge tone="lime">当前使用</ToneBadge></span>
            <span className="mt-auto pt-8 text-[1.25rem] font-medium tracking-[-.02em]">平台托管</span>
            <span className="mt-1 text-[.8125rem] leading-5 text-background/70">AI Hub 使用平台配置的 OpenAI-compatible 模型。密钥只存在于服务端环境变量，从不发送到浏览器。</span>
          </div>
          <div className="demo-outline flex min-h-[13rem] flex-col rounded-card p-5">
            <span className="flex items-center justify-between gap-2"><KeyRound aria-hidden="true" className="size-5" /><StatusPill status="planned" /></span>
            <span className="mt-auto pt-8 text-[1.25rem] font-medium tracking-[-.02em]">自带凭据 · BYOK</span>
            <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">加密保管、最小权限、出站访问控制与完整生命周期就绪后开放。自定义 Base URL 初期不支持。</span>
          </div>
        </div>
        <ul className="mt-6 border-t border-border/12">
          {credentials.map((credential) => (
            <li className="grid gap-x-6 gap-y-2 border-b border-border/12 py-4 min-[821px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[821px]:items-center" key={credential.id}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{credential.label}<SampleTag /></p>
                <p className="mt-1 text-[.75rem] text-muted-foreground">{credential.provider} · {credential.scope}</p>
              </div>
              <span className="font-code text-[.8125rem] tracking-wider">{credential.hint}</span>
              <span className="flex gap-2"><Button disabled size="sm" variant="outline">轮换</Button><Button disabled size="sm" variant="ghost">解绑</Button></span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled size="sm"><Plus className="size-3.5" />添加凭据</Button>
          <span className="text-[.75rem] text-muted-foreground">规划中：需要先完成 KMS 与密钥生命周期设计。</span>
        </div>
        <ul className="mt-10 grid gap-0.5 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {principles.map(([title, detail], index) => (
            <li className="enter flex min-h-[9rem] flex-col rounded-card bg-surface p-4" key={title} style={delay(60 + index * 60)}>
              <ShieldCheck aria-hidden="true" className="size-4" />
              <span className="mt-auto pt-6 text-sm font-medium">{title}</span>
              <span className="mt-1 text-[.75rem] leading-5 text-muted-foreground">{detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cx-grants" className="mt-20">
        <SectionHead id="cx-grants" meta={<SampleTag />}>项目授权</SectionHead>
        <GrantsTable grants={grants} projectBase={mode === "demo" ? "/platform/projects" : "/projects"} />
      </section>

      <section aria-labelledby="cx-flow" className="mt-20">
        <SectionHead id="cx-flow">数据去向</SectionHead>
        <div className="scroll-x">
          <table className="w-full min-w-[40rem] border-collapse text-left text-[.8125rem]">
            <thead>
              <tr className="border-b border-border/12 text-[.75rem] text-muted-foreground">
                <th className="py-2.5 pr-4 font-medium" scope="col">数据</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">处理方</th>
                <th className="py-2.5 font-medium" scope="col">用途</th>
              </tr>
            </thead>
            <tbody>
              {processors.map(([data, processor, purpose]) => (
                <tr className="border-b border-border/10" key={data}>
                  <th className="py-3.5 pr-4 font-medium" scope="row">{data}</th>
                  <td className="py-3.5 pr-4 text-muted-foreground">{processor}</td>
                  <td className="py-3.5 text-muted-foreground">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
