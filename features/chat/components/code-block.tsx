"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

const KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue", "def", "do", "else",
  "export", "extends", "false", "finally", "for", "from", "function", "if", "import", "in", "interface",
  "let", "new", "null", "return", "static", "throw", "true", "try", "type", "undefined", "var", "while",
]);

function highlightedCode(code: string): ReactNode[] {
  const tokens = code.split(/(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g);
  return tokens.map((token, index) => {
    let className = "";
    if (/^(\/\/|#)/.test(token)) className = "text-emerald-600 dark:text-emerald-400";
    else if (/^["'`]/.test(token)) className = "text-amber-700 dark:text-amber-300";
    else if (/^\d/.test(token)) className = "text-amber-400";
    else if (KEYWORDS.has(token)) className = "font-semibold text-emerald-300";
    return className ? <span className={className} key={`${index}-${token}`}>{token}</span> : token;
  });
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="my-5 max-w-full overflow-hidden rounded-control border border-white/10 bg-[#101716] text-[#eff7f3] shadow-[0_18px_45px_rgba(8,16,14,.22)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[.025] px-4 py-2.5 text-[.6875rem] font-semibold uppercase tracking-[.12em] text-white/45">
        <span>{language || "text"}</span>
        <button aria-label="复制代码" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 normal-case tracking-normal hover:bg-white/10 hover:text-white" onClick={copyCode} type="button">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="premium-scrollbar max-w-full overflow-x-auto p-4 text-[.8125rem] leading-6 sm:p-5 sm:text-sm">
        <code>{highlightedCode(code)}</code>
      </pre>
    </div>
  );
}
