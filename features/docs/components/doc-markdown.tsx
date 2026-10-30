import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ToneBadge } from "@/components/platform/primitives";
import { CopyButton } from "@/features/demos/components/ui";
import { headingSlug } from "@/features/docs/content";
import type { Tone } from "@/features/platform/labels";

/** Inline code `status:<kind>` renders as the status badge used across the docs. */
export const statusBadges: Record<string, { label: string; tone: Tone }> = {
  "status:demo": { label: "Demo 专用 · 已上线", tone: "lime" },
  "status:implemented": { label: "已实现", tone: "success" },
  "status:internal": { label: "本站内部接口", tone: "info" },
  "status:design": { label: "设计契约 · 未部署", tone: "warning" },
};

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function Heading({ level, children }: { level: 2 | 3 | 4; children: ReactNode }) {
  const id = headingSlug(textOf(children));
  const Tag = `h${level}` as const;
  const size = level === 2 ? "mt-16 text-[clamp(1.5rem,2.2vw,1.9rem)] tracking-[-.03em]" : level === 3 ? "mt-10 text-[1.1875rem] tracking-[-.02em]" : "mt-8 text-base";
  return (
    <Tag className={`group scroll-mt-28 font-medium leading-snug ${size}`} id={id}>
      {children}
      <a aria-label="本节链接" className="ml-2 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground focus-visible:text-muted-foreground" href={`#${id}`}>#</a>
    </Tag>
  );
}

function DocCode({ code, language }: { code: string; language?: string }) {
  return (
    <div className="my-5 overflow-hidden rounded-card bg-[hsl(var(--ink))] text-[hsl(var(--paper))]">
      <div className="flex h-10 items-center justify-between border-b border-[hsl(var(--paper)/.12)] pl-4 pr-1.5">
        <span className="font-code text-[.6875rem] text-[hsl(var(--paper)/.55)]">{language ?? "text"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="premium-scrollbar overflow-x-auto p-4 font-code text-[.75rem] leading-[1.7] text-[hsl(var(--paper)/.88)]"><code>{code}</code></pre>
    </div>
  );
}

export function DocMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className ?? "min-w-0 text-[.9375rem] leading-[1.8] text-foreground/92 [overflow-wrap:anywhere]"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <Heading level={2}>{children}</Heading>,
          h2: ({ children }) => <Heading level={2}>{children}</Heading>,
          h3: ({ children }) => <Heading level={3}>{children}</Heading>,
          h4: ({ children }) => <Heading level={4}>{children}</Heading>,
          p: ({ children }) => <p className="mt-4">{children}</p>,
          a: ({ children, href = "" }) => {
            const className = "font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-foreground";
            if (href.startsWith("/")) return <Link className={className} href={href} prefetch={false}>{children}</Link>;
            if (href.startsWith("#")) return <a className={className} href={href}>{children}</a>;
            return <a className={className} href={href} rel="noopener noreferrer" target="_blank">{children}</a>;
          },
          ul: ({ children }) => <ul className="mt-4 list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="mt-4 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => <blockquote className="mt-6 rounded-card border-l-2 border-[hsl(var(--lime))] bg-surface px-5 py-1 pb-4 text-[.875rem] text-foreground/85">{children}</blockquote>,
          hr: () => <hr className="my-10 border-border/12" />,
          pre: ({ children }) => <>{children}</>,
          code: ({ children, className }) => {
            const code = String(children).replace(/\n$/, "");
            if (className?.startsWith("language-")) return <DocCode code={code} language={/language-([\w-]+)/.exec(className)?.[1]} />;
            const badge = statusBadges[code];
            if (badge) return <ToneBadge className="mx-0.5 align-[.1em]" tone={badge.tone}>{badge.label}</ToneBadge>;
            return <code className="rounded-[.3rem] bg-surface-muted px-1.5 py-0.5 font-code text-[.8125em]">{children}</code>;
          },
          table: ({ children }) => (
            <div className="premium-scrollbar mt-5 overflow-x-auto rounded-card bg-surface">
              <table className="w-full min-w-[34rem] border-collapse text-left text-[.8125rem] leading-6">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="text-[.75rem] text-muted-foreground">{children}</thead>,
          th: ({ children }) => <th className="border-b border-border/12 px-4 py-2.5 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b border-border/8 px-4 py-2.5 align-top">{children}</td>,
          strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

