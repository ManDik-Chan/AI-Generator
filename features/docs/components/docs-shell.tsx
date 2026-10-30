import Link from "next/link";
import type { ReactNode } from "react";

import { Kicker, delay } from "@/components/platform/primitives";
import { ManifestValidator } from "@/features/platform/components/manifest-validator";
import { DocMarkdown } from "@/features/docs/components/doc-markdown";
import { TryIt } from "@/features/docs/components/try-it";
import { docTitle, splitWidgets, tableOfContents, withoutTitle } from "@/features/docs/content";
import { cn } from "@/lib/utils";

export const docsNav = [
  { href: "/docs", label: "概览", english: "Overview" },
  { href: "/docs/guide", label: "开发者手册", english: "Guide" },
  { href: "/docs/api", label: "API Reference", english: "API" },
  { href: "/docs/manifest", label: "Manifest 与能力", english: "Manifest" },
  { href: "/docs/status", label: "接口清单", english: "Status" },
] as const;

const resources = [
  { href: "/api/demo/v1/openapi.json", label: "openapi.json" },
  { href: "/demos/route-optimizer", label: "Demo · 路线优化" },
  { href: "/demos/neural-network", label: "Demo · 神经网络" },
] as const;

const widgets: Record<string, () => ReactNode> = {
  "try-it": () => <TryIt />,
  "manifest-validator": () => (
    <div className="my-6">
      <ManifestValidator />
    </div>
  ),
};

function DocsNav({ active }: { active: string }) {
  return (
    <nav aria-label="开发者文档" className="min-w-0">
      <ul className="scroll-x -mx-1 flex gap-1 px-1 min-[1024px]:mx-0 min-[1024px]:flex-col min-[1024px]:px-0">
        {docsNav.map((item) => {
          const current = item.href === active;
          return (
            <li className="shrink-0" key={item.href}>
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center justify-between gap-3 rounded-full px-4 text-[.8125rem] font-medium transition-colors duration-300 min-[1024px]:rounded-control",
                  current ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
                href={item.href}
                prefetch={false}
              >
                {item.label}
                <span className="hidden font-code text-[.625rem] opacity-60 min-[1024px]:inline">{item.english}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 hidden px-4 text-[.6875rem] text-muted-foreground min-[1024px]:block">资源</p>
      <ul className="mt-2 hidden space-y-1 min-[1024px]:block">
        {resources.map((item) => (
          <li key={item.href}>
            <Link className="block rounded-control px-4 py-1.5 font-code text-[.75rem] text-muted-foreground hover:bg-surface hover:text-foreground" href={item.href} prefetch={false}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Two- or three-column docs layout: section nav, content, and the page's table of contents. */
export function DocsFrame({ active, children, toc }: { active: string; children: ReactNode; toc?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[100rem] gap-8 px-4 pt-6 min-[521px]:px-6 min-[1024px]:grid-cols-[13.5rem_minmax(0,1fr)] min-[1024px]:gap-12 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)] min-[1024px]:pt-10 min-[1280px]:grid-cols-[13.5rem_minmax(0,1fr)_13rem]">
      <aside className="min-w-0 min-[1024px]:sticky min-[1024px]:top-24 min-[1024px]:self-start">
        <DocsNav active={active} />
      </aside>
      <div className="min-w-0">{children}</div>
      {toc ? <aside className="hidden min-w-0 min-[1280px]:sticky min-[1280px]:top-24 min-[1280px]:block min-[1280px]:self-start">{toc}</aside> : null}
    </div>
  );
}

function Toc({ markdown }: { markdown: string }) {
  const entries = tableOfContents(markdown);
  if (!entries.length) return null;
  return (
    <nav aria-label="本页目录" className="premium-scrollbar max-h-[calc(100vh-8rem)] overflow-y-auto">
      <p className="text-[.6875rem] text-muted-foreground">本页</p>
      <ol className="mt-3 space-y-1 border-l border-border/12">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a className={cn("-ml-px block border-l border-transparent py-1 text-[.75rem] leading-5 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground", entry.depth === 2 ? "pl-3" : "pl-6")} href={`#${entry.id}`}>{entry.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A Markdown file from docs/developer rendered as a docs page. */
export function DocPage({ markdown, active, kicker, source }: { markdown: string; active: string; kicker: string; source: string }) {
  const title = docTitle(markdown);
  const body = withoutTitle(markdown);
  const [lead, ...rest] = body.split(/\n\n/);
  const isLead = lead && !/^[#|>`<-]/.test(lead.trim());
  const segments = splitWidgets(isLead ? rest.join("\n\n") : body);
  return (
    <DocsFrame active={active} toc={<Toc markdown={markdown} />}>
      <article className="max-w-[52rem] pb-8">
        <header>
          <div className="enter"><Kicker>{kicker}</Kicker></div>
          <h1 className="mt-4 text-balance text-[clamp(2.25rem,4.4vw,3.75rem)] font-medium leading-[1.04] tracking-[-.04em]"><span className="title-line"><span>{title}</span></span></h1>
          {isLead ? <div className="enter mt-1" style={delay(200)}><DocMarkdown className="min-w-0 text-[1rem] leading-7 text-muted-foreground [overflow-wrap:anywhere]" text={lead} /></div> : null}
          <p className="enter mt-5 font-code text-[.6875rem] text-muted-foreground" style={delay(260)}>源文件 {source}</p>
        </header>
        {segments.map((segment, index) => (segment.kind === "widget" ? <div key={index}>{widgets[segment.name]?.() ?? null}</div> : <DocMarkdown key={index} text={segment.text} />))}
      </article>
    </DocsFrame>
  );
}
