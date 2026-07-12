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
    else if (/^\d/.test(token)) className = "text-violet-600 dark:text-violet-300";
    else if (KEYWORDS.has(token)) className = "font-semibold text-sky-700 dark:text-sky-300";
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
    <div className="my-4 max-w-full overflow-hidden rounded-xl border bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-slate-400">
        <span>{language || "text"}</span>
        <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10 hover:text-white" onClick={copyCode} type="button">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-4 text-sm leading-6">
        <code>{highlightedCode(code)}</code>
      </pre>
    </div>
  );
}
