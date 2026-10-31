import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { ArrowLink, DemoNotice, SampleTag, SectionHead, SpecRow, ToneBadge, delay } from "@/components/platform/primitives";
import { draftStateMeta, formatVersion } from "@/features/platform/labels";
import type { PlatformProject } from "@/features/platform/types";
import { ExperimentReplay } from "@/features/research/components/experiment-replay";
import { Breadcrumbs, ClaimStatusBadge, EvidenceList, ExperimentStatusBadge, RequirementList, ResearchFixtureNotice, SiteLabel } from "@/features/research/components/parts";
import { CheckList, ResultTable } from "@/features/research/components/result-table";
import { experimentStatusMeta, RESEARCH_FIXTURE_LABEL, reproducibilityLabel, siteMeta } from "@/features/research/labels";
import { buildRevision, claimHref, claimsForExperiment, commitUrl, experimentHref, referenceOutcome, repoFileUrl, researchHref } from "@/features/research/source";
import type { ExperimentRecord, ResearchProject } from "@/features/research/types";

function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CommandBlock({ command }: { command: string }) {
  return <pre className="mt-3 whitespace-pre-wrap break-all rounded-[.75rem] bg-surface-raised px-3 py-2.5 font-code text-[.75rem] leading-5 shadow-[inset_0_0_0_1px_hsl(var(--border)/.1)]"><code>{command}</code></pre>;
}

function timeline(experiment: ExperimentRecord, revision?: string) {
  const entries: { label: string; when: string; detail: string }[] = [
    { label: `协议 ${experiment.protocol.version}`, when: experiment.protocol.defined, detail: "方法、参数与判定标准写定。" },
  ];
  if (experiment.status === "REPRODUCIBLE") {
    entries.push(
      { label: "参考结果", when: "页面构建时", detail: `由仓库代码计算${revision ? `（提交 ${revision.slice(0, 7)}）` : ""}，数值没有手写。` },
      { label: "本机复现", when: "你的会话", detail: "每一次复现只保存在当前页面，不上传，也不会写回这条记录。" },
    );
  } else if (experiment.status === "TEST_COVERED") {
    entries.push({ label: "自动化测试", when: "每个 Pull Request", detail: "CI 运行同一组测试；这条记录不引用某一次运行的结果。" });
  } else {
    entries.push({ label: "执行", when: "尚未执行", detail: experiment.status === "BLOCKED" ? "等待平台提供所需能力，见解锁条件。" : "作者尚未执行；平台条件见解锁条件。" });
  }
  return entries;
}

/** One experiment record: what it tests, how, where it runs, what it found and how to check it. */
export function ExperimentView({ project, experiment, showcase }: { project: ResearchProject; experiment: ExperimentRecord; showcase?: PlatformProject }) {
  const claims = claimsForExperiment(project, experiment);
  const reference = referenceOutcome(experiment);
  const revision = buildRevision();
  const index = project.experiments.indexOf(experiment);
  const previous = index > 0 ? project.experiments[index - 1] : undefined;
  const next = project.experiments[index + 1];

  return (
    <article className="mx-auto max-w-[100rem] px-4 pt-6 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10">
      <Breadcrumbs trail={[{ label: "Research Lab", href: "/research" }, { label: project.title, href: researchHref(project.slug) }, { label: experiment.id }]} />

      <header className="pb-10 pt-8 min-[1024px]:pb-12">
        <div className="enter flex flex-wrap items-center gap-2">
          <span className="font-code text-[.8125rem] font-medium">{experiment.id}</span>
          <ExperimentStatusBadge status={experiment.status} />
          <SiteLabel className="ml-1" site={experiment.site} />
          <SampleTag>{RESEARCH_FIXTURE_LABEL}</SampleTag>
        </div>
        <h1 className="mt-4 max-w-[60rem] text-balance text-[clamp(2.1rem,4.4vw,4rem)] font-medium leading-[1.05] tracking-[-.04em]"><span className="title-line"><span>{experiment.title}</span></span></h1>
        <p className="enter mt-5 max-w-[46rem] text-[clamp(1.05rem,1.4vw,1.3rem)] leading-[1.55] tracking-[-.01em]" style={delay(220)}>{experiment.objective}</p>
      </header>

      <div className="space-y-2">
        <ResearchFixtureNotice />
        {project.provenance === "sample" ? <DemoNotice label="示例项目">这条实验记录属于 Showcase 中的示例项目；{experiment.replay ? "但它运行的是仓库里的真实代码，结果由计算得到。" : "它没有结果，只展示协议与解锁条件。"}</DemoNotice> : null}
      </div>

      <div className="mt-12 grid gap-14 min-[1180px]:grid-cols-[minmax(0,1fr)_21rem] min-[1180px]:gap-16">
        <div className="min-w-0 space-y-16">
          <section aria-labelledby="exp-claims">
            <SectionHead id="exp-claims" meta={<span className="text-caption">实验结果不会改变声明等级</span>}>检验的声明</SectionHead>
            <ul className="border-t border-border/12">
              {claims.map((claim) => (
                <li className="grid gap-x-6 gap-y-2 border-b border-border/12 py-4 min-[640px]:grid-cols-[8.5rem_minmax(0,1fr)_auto] min-[640px]:items-start" key={claim.id}>
                  <span><ClaimStatusBadge status={claim.status} /></span>
                  <span className="min-w-0">
                    <span className="block text-[.9375rem] font-medium">{claim.topic}</span>
                    <span className="mt-1 block text-[.8125rem] leading-6 text-muted-foreground">{claim.statement}</span>
                  </span>
                  <ArrowLink className="min-[640px]:pt-0.5" href={claimHref(project.slug, claim.id)}>证据链</ArrowLink>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="exp-method">
            <SectionHead id="exp-method" meta={<span className="text-caption">协议 {experiment.protocol.version}</span>}>方法</SectionHead>
            <ol className="space-y-3">
              {experiment.method.map((step, stepIndex) => (
                <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2" key={step}>
                  <span className="pt-[.3rem] font-code text-[.75rem] text-muted-foreground">{String(stepIndex + 1).padStart(2, "0")}</span>
                  <span className="text-[.9375rem] leading-7">{step}</span>
                </li>
              ))}
            </ol>
            <h3 className="mt-10 text-[.8125rem] font-medium">参数</h3>
            <dl className="mt-1">
              {experiment.parameters.map((parameter) => <SpecRow key={parameter.name} label={parameter.name}>{parameter.value}</SpecRow>)}
            </dl>
          </section>

          <section aria-labelledby="exp-result">
            <SectionHead id="exp-result" meta={reference ? <ToneBadge tone="success">参考结果 · 构建时计算</ToneBadge> : null}>结果</SectionHead>
            {reference ? (
              <>
                <ResultTable caption={`${experiment.id} 的参考结果`} outcome={reference} />
                <div className="mt-6 rounded-card border border-border/12 p-4 min-[640px]:p-5">
                  <p className="text-[.75rem] text-muted-foreground">判定标准</p>
                  <p className="mt-1 text-[.875rem] leading-6">{experiment.criterion}</p>
                  <CheckList checks={reference.checks} className="mt-4" />
                </div>
                <p className="mt-4 text-caption">
                  参考结果由本页构建时运行「环境」中列出的仓库代码得到，没有手写任何数值。{revision ? <>代码版本 <a className="link-grow font-code" href={commitUrl(revision)} rel="noopener noreferrer" target="_blank">{revision.slice(0, 7)}</a>。</> : "本次构建没有注入提交号。"}
                </p>
              </>
            ) : experiment.status === "TEST_COVERED" ? (
              <div className="rounded-card bg-surface p-5">
                <p className="text-sm font-medium">结果由仓库中的自动化测试给出</p>
                <p className="mt-1.5 max-w-[40rem] text-[.8125rem] leading-6 text-muted-foreground">本页不执行测试，也不引用某一次 CI 运行的结果。在仓库根目录运行下面的命令即可复现；判定标准：{experiment.criterion}</p>
                {experiment.reproducibility.command ? <CommandBlock command={experiment.reproducibility.command} /> : null}
              </div>
            ) : (
              <div className="rounded-card border border-dashed border-foreground/18 px-5 py-8">
                <p className="text-sm font-medium">没有结果</p>
                <p className="mt-1.5 max-w-[42rem] text-[.8125rem] leading-6 text-muted-foreground">{experiment.pending?.reason}</p>
              </div>
            )}
          </section>

          {experiment.replay && reference ? (
            <section aria-labelledby="exp-replay">
              <SectionHead id="exp-replay" meta={<ToneBadge tone="lime">浏览器内 · 不发送请求</ToneBadge>}>本机复现</SectionHead>
              <ExperimentReplay kind={experiment.replay} reference={reference} />
            </section>
          ) : null}

          {experiment.pending ? (
            <section aria-labelledby="exp-unblock">
              <SectionHead id="exp-unblock" meta={<span className="text-caption">平台需要先提供这些能力</span>}>解锁条件</SectionHead>
              <RequirementList ids={experiment.pending.requires} />
            </section>
          ) : null}

          <section aria-labelledby="exp-limits">
            <SectionHead id="exp-limits">局限</SectionHead>
            <ul className="space-y-2">
              {experiment.limitations.map((item) => <li className="text-[.9375rem] leading-7 text-muted-foreground" key={item}>— {item}</li>)}
            </ul>
          </section>

          <section aria-labelledby="exp-log">
            <SectionHead id="exp-log">记录</SectionHead>
            <ol className="relative ml-1 border-l border-border/16 pl-6">
              {timeline(experiment, revision).map((entry, entryIndex) => (
                <li className="relative pb-7 last:pb-0" key={entry.label}>
                  <span aria-hidden="true" className={entryIndex === 0 ? "absolute -left-[1.81rem] top-1 size-3 rounded-full border-2 border-background bg-foreground" : "absolute -left-[1.81rem] top-1 size-3 rounded-full border-2 border-background bg-muted-foreground/40"} />
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[.875rem] font-medium">{entry.label}<span className="text-[.75rem] font-normal text-muted-foreground">{entry.when}</span></p>
                  <p className="mt-1 text-[.8125rem] leading-6 text-muted-foreground">{entry.detail}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-label="实验信息" className="space-y-0.5">
          <AsideCard title="状态">
            <ExperimentStatusBadge status={experiment.status} />
            <p className="mt-2 text-[.75rem] leading-5 text-muted-foreground">{experimentStatusMeta[experiment.status].detail}</p>
            <p className="mt-3 border-t border-border/12 pt-3"><SiteLabel className="text-foreground" site={experiment.site} /></p>
            <p className="mt-1 text-[.75rem] leading-5 text-muted-foreground">{siteMeta[experiment.site].detail}</p>
          </AsideCard>

          <AsideCard title="可复现性">
            <p className="text-[.8125rem] font-medium">{reproducibilityLabel[experiment.reproducibility.level]}</p>
            <p className="mt-1.5 text-[.75rem] leading-5 text-muted-foreground">{experiment.reproducibility.detail}</p>
            {experiment.reproducibility.command && experiment.status !== "TEST_COVERED" ? (
              <>
                <p className="mt-3 text-[.75rem] text-muted-foreground">在仓库中检查同一结论</p>
                <CommandBlock command={experiment.reproducibility.command} />
              </>
            ) : null}
          </AsideCard>

          <AsideCard title="环境">
            <dl className="space-y-3 text-[.8125rem]">
              <div><dt className="text-[.75rem] text-muted-foreground">运行时</dt><dd className="mt-0.5 leading-5">{experiment.environment.runtime}</dd></div>
              <div>
                <dt className="text-[.75rem] text-muted-foreground">代码入口</dt>
                <dd className="mt-1">
                  {experiment.environment.entry.length ? (
                    <ul className="space-y-1.5">
                      {experiment.environment.entry.map((entry) => (
                        <li key={`${entry.path}#${entry.symbol}`}>
                          <a className="group inline-flex items-start gap-1" href={repoFileUrl(entry.path)} rel="noopener noreferrer" target="_blank">
                            <span className="font-code text-[.75rem] font-medium"><span className="link-grow">{entry.symbol}</span></span>
                            <ArrowUpRight aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                          </a>
                          <span className="block break-all font-code text-[.6875rem] text-muted-foreground">{entry.path}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <span className="text-[.75rem] text-muted-foreground">示例项目没有源码。</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[.75rem] text-muted-foreground">依赖与版本</dt>
                <dd className="mt-0.5 leading-5">{experiment.environment.dependencies.length ? experiment.environment.dependencies.map((dependency) => `${dependency.name} ${dependency.version}`).join(" · ") : "待定"}</dd>
              </div>
              <div><dt className="text-[.75rem] text-muted-foreground">随机性</dt><dd className="mt-0.5 leading-5">{experiment.environment.randomness}</dd></div>
            </dl>
          </AsideCard>

          <AsideCard title="版本">
            <dl>
              <SpecRow label="协议">{experiment.protocol.version} · {experiment.protocol.defined}</SpecRow>
              <SpecRow label="代码">{revision ? <span className="font-code">{revision.slice(0, 7)}</span> : "未注入提交号"}</SpecRow>
              {showcase ? <SpecRow className="border-b-0" label="关联项目"><span className="font-code">{formatVersion(showcase.version)}</span> · {draftStateMeta[showcase.draftState].label}{showcase.provenance === "sample" ? "（示例）" : ""}</SpecRow> : null}
            </dl>
          </AsideCard>

          <AsideCard title="证据">
            <EvidenceList empty="这条实验记录还没有证据。" items={experiment.evidence} />
          </AsideCard>

          {showcase ? (
            <AsideCard title="关联">
              <ul className="space-y-2">
                <li><ArrowLink href={researchHref(project.slug)}>研究项目 · {project.title}</ArrowLink></li>
                <li><ArrowLink href={`/explore/${showcase.slug}`}>Showcase 项目页</ArrowLink></li>
              </ul>
            </AsideCard>
          ) : null}
        </aside>
      </div>

      {previous || next ? (
        <nav aria-label="同一项目的其他实验" className="mt-24 grid gap-0.5 min-[640px]:grid-cols-2">
          {previous ? (
            <Link className="group flex flex-col rounded-card bg-surface p-5 transition-colors duration-500 hover:bg-surface-muted" href={experimentHref(project.slug, previous.id)} prefetch={false}>
              <span className="inline-flex items-center gap-1.5 text-caption"><ArrowLeft aria-hidden="true" className="size-3.5" />上一个实验</span>
              <span className="mt-3 font-code text-[.75rem]">{previous.id}</span>
              <span className="mt-0.5 text-[1rem] font-medium tracking-[-.01em]">{previous.title}</span>
            </Link>
          ) : <span aria-hidden="true" className="hidden min-[640px]:block" />}
          {next ? (
            <Link className="group flex flex-col rounded-card bg-surface p-5 text-right transition-colors duration-500 hover:bg-surface-muted min-[640px]:items-end" href={experimentHref(project.slug, next.id)} prefetch={false}>
              <span className="inline-flex items-center gap-1.5 text-caption">下一个实验<ArrowRight aria-hidden="true" className="size-3.5" /></span>
              <span className="mt-3 font-code text-[.75rem]">{next.id}</span>
              <span className="mt-0.5 text-[1rem] font-medium tracking-[-.01em]">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </article>
  );
}
