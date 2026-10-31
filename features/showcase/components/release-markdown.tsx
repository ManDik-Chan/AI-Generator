import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * Markdown from a project's presentation sections. Unlike the site's own docs, this text is
 * authored by project members, so it is rendered restrictively: no raw HTML, no images (they
 * must come from the asset service as IMAGE sections), headings start at h3 under the
 * section's own h2, and links open as untrusted external links.
 */
const allowed = ["p", "h1", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "del", "code", "pre", "blockquote", "a", "hr", "br", "table", "thead", "tbody", "tr", "th", "td"];

const heading = ({ children }: { children?: ReactNode }) => <h3 className="mt-8 text-[1.0625rem] font-medium tracking-[-.015em]">{children}</h3>;

export function ReleaseMarkdown({ children }: { children: string }) {
  return (
    <div className="max-w-[46rem] text-[.9375rem] leading-7">
      <ReactMarkdown
        allowedElements={allowed}
        components={{
          h1: heading,
          h2: heading,
          h3: heading,
          h4: ({ children: text }) => <h4 className="mt-6 text-[.9375rem] font-medium">{text}</h4>,
          p: ({ children: text }) => <p className="mt-4 first:mt-0">{text}</p>,
          ul: ({ children: items }) => <ul className="mt-4 list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{items}</ul>,
          ol: ({ children: items }) => <ol className="mt-4 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">{items}</ol>,
          blockquote: ({ children: text }) => <blockquote className="mt-4 border-l-2 border-border/30 pl-4 text-muted-foreground">{text}</blockquote>,
          code: ({ children: text }) => <code className="rounded bg-surface-raised px-1 py-0.5 font-code text-[.8125rem]">{text}</code>,
          pre: ({ children: text }) => <pre className="scroll-x mt-4 rounded-control bg-surface-raised p-4 text-[.8125rem] leading-6">{text}</pre>,
          a: ({ href, children: text }) => <a className="link-grow font-medium" href={href} rel="noopener noreferrer nofollow ugc" target="_blank">{text}</a>,
          table: ({ children: rows }) => <div className="scroll-x mt-4"><table className="w-full border-collapse text-left text-[.8125rem]">{rows}</table></div>,
          th: ({ children: text }) => <th className="border-b border-border/20 py-2 pr-4 font-medium" scope="col">{text}</th>,
          td: ({ children: text }) => <td className="border-b border-border/12 py-2 pr-4">{text}</td>,
        }}
        remarkPlugins={[remarkGfm]}
        skipHtml
        unwrapDisallowed
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
