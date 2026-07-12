import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/features/chat/components/code-block";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 space-y-3 text-sm leading-7 sm:text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a className="text-primary underline underline-offset-4" href={href} rel="noopener noreferrer" target="_blank">
              {children}
            </a>
          ),
          blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/40 pl-4 text-muted-foreground">{children}</blockquote>,
          code: ({ children, className }) => {
            const code = String(children).replace(/\n$/, "");
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            if (className?.startsWith("language-")) return <CodeBlock code={code} language={language} />;
            return <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>;
          },
          h1: ({ children }) => <h1 className="mt-6 text-2xl font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-5 text-xl font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-4 text-lg font-semibold">{children}</h3>,
          hr: () => <hr className="my-5" />,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
          td: ({ children }) => <td className="border px-3 py-2">{children}</td>,
          th: ({ children }) => <th className="border bg-muted px-3 py-2 font-semibold">{children}</th>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
