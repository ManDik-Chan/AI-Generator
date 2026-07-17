import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/features/chat/components/code-block";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-wrap-anywhere text-[.9375rem] leading-[1.78] text-foreground/94">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a className="break-all text-primary underline underline-offset-4" href={href} rel="noopener noreferrer" target="_blank">
              {children}
            </a>
          ),
          blockquote: ({ children }) => <blockquote className="my-4 rounded-r-control border-l-2 border-primary/45 bg-primary-subtle/45 py-2 pl-4 pr-3 text-muted-foreground">{children}</blockquote>,
          code: ({ children, className }) => {
            const code = String(children).replace(/\n$/, "");
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            if (className?.startsWith("language-")) return <CodeBlock code={code} language={language} />;
            return <code className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-primary-subtle-foreground">{children}</code>;
          },
          h1: ({ children }) => <h1 className="mt-7 text-2xl font-semibold tracking-[-.035em]">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-6 text-xl font-semibold tracking-[-.025em]">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-5 text-lg font-semibold tracking-[-.015em]">{children}</h3>,
          hr: () => <hr className="premium-divider my-6" />,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
          p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => <div className="premium-scrollbar my-4 max-w-full overflow-x-auto rounded-control border border-border/10"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
          td: ({ children }) => <td className="border border-border/10 px-3 py-2.5">{children}</td>,
          th: ({ children }) => <th className="border border-border/10 bg-surface-muted px-3 py-2.5 font-semibold">{children}</th>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
