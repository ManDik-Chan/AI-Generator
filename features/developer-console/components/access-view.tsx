import { KeyRound, LockKeyhole, ShieldCheck, UserCheck } from "lucide-react";

import { ArrowLink, DemoNotice, PageIntro, SectionHead, StatusPill, ToneBadge, delay } from "@/components/platform/primitives";
import { PermissionMatrix } from "@/features/developer-console/components/permission-matrix";
import { draftDTOSchema, releaseDTOSchema, versionDTOSchema } from "@/features/registry/contracts";

const gates = [
  { icon: UserCheck, title: "已验证的会话", detail: "每个命令都向 Auth 验证 token，并在事务里核对会话仍然存在、未登出、未过期。只看 JWT 没过期是不够的。" },
  { icon: ShieldCheck, title: "平台操作资格", detail: "按动作单独授予、有到期时间的内部资格。登录、管理员身份或项目所有者都不会自动获得。撤销立即生效。" },
  { icon: LockKeyhole, title: "项目成员角色", detail: "只在本项目内有效。缺少角色时返回 NOT_FOUND，而不是 FORBIDDEN，避免泄露项目是否存在。" },
];

const notAuthority = ["Profile.ADMIN 管理员身份", "“我是项目所有者”", "JWT 里的 role 或 user_metadata", "调用方传入的 owner / reviewer / epoch", "旧的成功回执"];

/** Field names read from the merged zod schemas, so this list cannot drift from the contract. */
function fieldsOf(schema: { shape: Record<string, unknown> }) {
  return Object.keys(schema.shape);
}

const neverExposed = [
  ["ownerId / owner", "所有者身份只用于服务端授权"],
  ["submitter / reviewer / requester", "审核与批准参与者不进入公开 DTO"],
  ["authzEpoch · policyRevision", "授权状态由服务端复检，不交给客户端"],
  ["storageRef · rightsRef · provenance", "资产存储位置与权利依据"],
  ["credential · apiKey", "任何凭据字段都会被严格 schema 拒绝"],
  ["命令回执与失效事实", "只存在于 private schema，客户端没有表权限"],
];

const visibilityRows = [
  { key: "PUBLIC", label: "公开", allowed: "当前有效 Release 的严格 ReleaseDTO；可进入目录与搜索", denied: "草稿、原始 Version、私有资产、成员与审批主体" },
  { key: "UNLISTED", label: "不公开列出", allowed: "当前有效 Release 的直接查询；不进入目录、搜索或 sitemap", denied: "同上；难猜的链接不等于访问权限" },
  { key: "PRIVATE", label: "私有", allowed: "没有任何公开查询、摘要、资产或历史投影", denied: "所有 Registry 内部数据" },
];

const dataFlows = [
  { level: "L0 展示", where: "不处理使用者数据", detail: "只读取项目已发布的公开内容。" },
  { level: "Demo · 服务端", where: "平台服务端", detail: "输入只用于本次计算，不保存、不写日志、不发往外部。" },
  { level: "Demo · 浏览器", where: "你的设备", detail: "数据在本机生成，从不上传。" },
  { level: "L2 远程 API（规划）", where: "项目运营方的服务", detail: "每次运行前单独告知并征得同意；运营方看不到你的账户信息。" },
];

export function AccessView({ base, connectionsHref }: { base: string; connectionsHref: string }) {
  const dtos = [
    { name: "DraftDTO", note: "成员读取草稿", fields: fieldsOf(draftDTOSchema) },
    { name: "VersionDTO", note: "不可变版本快照", fields: fieldsOf(versionDTOSchema) },
    { name: "ReleaseDTO", note: "未来的公开投影（尚未开放）", fields: fieldsOf(releaseDTOSchema) },
  ];

  return (
    <div className="pb-6">
      <PageIntro
        description="谁能执行一个操作由三道相互独立的门决定；别人能看到什么由严格的字段白名单决定。项目公开不等于使用者的数据公开，授权一个项目也不等于把凭据交给它。"
        kicker="权限与隐私 · Access & privacy"
        meta={<StatusPill status="dev" />}
        title={["三道门决定能做什么，", "白名单决定能看见什么。"]}
      />

      <section aria-labelledby="ac-gates">
        <SectionHead id="ac-gates">三道门，缺一不可</SectionHead>
        <ol className="grid gap-0.5 min-[821px]:grid-cols-3">
          {gates.map((gate, index) => (
            <li className="enter flex min-h-[13rem] flex-col rounded-card bg-surface p-5" key={gate.title} style={delay(60 + index * 60)}>
              <span className="flex items-center justify-between"><gate.icon aria-hidden="true" className="size-5" /><span className="font-code text-[.75rem] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span></span>
              <span className="mt-auto pt-8 text-[1.0625rem] font-medium tracking-[-.015em]">{gate.title}</span>
              <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">{gate.detail}</span>
            </li>
          ))}
        </ol>
        <div className="mt-0.5 rounded-card border border-dashed border-foreground/18 p-5">
          <p className="text-sm font-medium">这些都不构成授权</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">{notAuthority.map((item) => <li key={item}><ToneBadge tone="neutral">{item}</ToneBadge></li>)}</ul>
        </div>
      </section>

      <section aria-labelledby="ac-matrix" className="mt-20">
        <SectionHead id="ac-matrix" action={<ArrowLink href={`${base}/projects/air-quality`}>在发布台试一试</ArrowLink>}>操作与角色</SectionHead>
        <PermissionMatrix />
      </section>

      <section aria-labelledby="ac-dto" className="mt-20">
        <SectionHead id="ac-dto" meta={<span className="text-caption">字段直接读取自 features/registry/contracts.ts</span>}>DTO 字段白名单</SectionHead>
        <div className="grid gap-0.5 min-[1024px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ul className="grid gap-0.5 min-[640px]:grid-cols-3">
            {dtos.map((dto) => (
              <li className="rounded-card bg-surface p-5" key={dto.name}>
                <p className="font-code text-[.8125rem] font-medium">{dto.name}</p>
                <p className="mt-0.5 text-[.6875rem] text-muted-foreground">{dto.note}</p>
                <ul className="mt-4 space-y-1">{dto.fields.map((field) => <li className="font-code text-[.75rem]" key={field}>{field}</li>)}</ul>
              </li>
            ))}
          </ul>
          <div className="rounded-card bg-foreground p-5 text-background">
            <p className="text-sm font-medium">永不出现在 DTO 中</p>
            <p className="mt-1 text-[.6875rem] text-background/70">所有层级都拒绝未知字段，不会静默丢弃。</p>
            <dl className="mt-4 space-y-2.5">
              {neverExposed.map(([field, why]) => (
                <div key={field}><dt className="font-code text-[.75rem]">{field}</dt><dd className="text-[.6875rem] text-background/70">{why}</dd></div>
              ))}
            </dl>
          </div>
        </div>
        <p className="mt-3 text-[.75rem] leading-5 text-muted-foreground">结构校验不会识别自由文本里的秘密，也不净化 Markdown：不要把凭据或个人信息写进简介和正文。</p>
      </section>

      <section aria-labelledby="ac-visibility" className="mt-20">
        <SectionHead id="ac-visibility" meta={<ToneBadge tone="warning">暂定契约</ToneBadge>}>可见性与公开投影</SectionHead>
        <DemoNotice className="mb-5" label="尚未开放">公开读取目前对所有输入统一返回 NOT_FOUND；探索目录仍使用示例数据。下表是发布协议草案对未来公开读取的要求：任何检查失败一律不分发，也不会回退到上一个版本或草稿。</DemoNotice>
        <div className="scroll-x">
          <table className="w-full min-w-[40rem] border-collapse text-left text-[.8125rem]">
            <thead>
              <tr className="border-b border-border/12 text-[.75rem] text-muted-foreground">
                <th className="py-2.5 pr-4 font-medium" scope="col">可见性</th>
                <th className="py-2.5 pr-4 font-medium" scope="col">允许</th>
                <th className="py-2.5 font-medium" scope="col">始终拒绝</th>
              </tr>
            </thead>
            <tbody>
              {visibilityRows.map((row) => (
                <tr className="border-b border-border/10 align-top" key={row.key}>
                  <th className="py-3.5 pr-4 font-medium" scope="row">{row.label}<span className="mt-0.5 block font-code text-[.6875rem] font-normal text-muted-foreground">{row.key}</span></th>
                  <td className="py-3.5 pr-4 text-muted-foreground">{row.allowed}</td>
                  <td className="py-3.5 text-muted-foreground">{row.denied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[.75rem] leading-5 text-muted-foreground">撤回、替换、转为私有、成员或资格变化、审核失效、资产退休之后，旧链接与旧缓存都应立即失效。</p>
      </section>

      <section aria-labelledby="ac-byok" className="mt-20">
        <SectionHead id="ac-byok" meta={<StatusPill status="planned" />} action={<ArrowLink href={connectionsHref}>连接与授权</ArrowLink>}>模型凭据 · BYOK</SectionHead>
        <div className="grid gap-0.5 min-[821px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="demo-outline flex min-h-[12rem] flex-col rounded-card p-5">
            <span className="flex items-center justify-between gap-2"><KeyRound aria-hidden="true" className="size-5" /><ToneBadge tone="neutral">未实现</ToneBadge></span>
            <span className="mt-auto pt-8 text-[1.125rem] font-medium tracking-[-.015em]">控制台里没有任何接收密钥的输入框</span>
            <span className="mt-1 text-[.8125rem] leading-5 text-muted-foreground">自带凭据需要先完成 KMS 加密保管、轮换、出站访问控制与 SSRF 防护。在此之前，平台只使用服务端环境变量里的托管密钥，从不发送到浏览器。</span>
          </div>
          <ol className="rounded-card bg-surface p-5">
            {[
              ["你的密钥", "只提交一次，之后只显示末四位"],
              ["加密保管（规划）", "KMS + AEAD，按账户隔离"],
              ["平台代理（规划）", "调用经平台出站，项目作者永远拿不到原始密钥"],
              ["模型提供方", "失败时直接报错，不会悄悄换成平台密钥"],
            ].map(([title, detail], index) => (
              <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-b border-border/12 py-3 last:border-b-0" key={title}>
                <span className="font-code text-[.75rem] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <span><span className="block text-[.8125rem] font-medium">{title}</span><span className="block text-[.75rem] text-muted-foreground">{detail}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="ac-flow" className="mt-20">
        <SectionHead id="ac-flow">使用者的数据去哪里</SectionHead>
        <ul className="grid gap-0.5 min-[640px]:grid-cols-2 min-[1181px]:grid-cols-4">
          {dataFlows.map((flow) => (
            <li className="flex min-h-[10rem] flex-col rounded-card bg-surface p-5" key={flow.level}>
              <span className="text-[.75rem] text-muted-foreground">{flow.level}</span>
              <span className="mt-auto pt-6 text-sm font-medium">{flow.where}</span>
              <span className="mt-1 text-[.75rem] leading-5 text-muted-foreground">{flow.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
