import Link from "next/link";

const columns = [
  { title: "平台", links: [["探索项目", "/explore"], ["演示工作台", "/platform"], ["开发者", "/platform/developer"], ["连接与授权", "/platform/connections"]] },
  { title: "AI Hub", links: [["对话", "/chat"], ["人格", "/personas"], ["记忆", "/memories"], ["工具", "/tools"]] },
  { title: "账户", links: [["登录", "/login"], ["注册", "/register"], ["进入工作台", "/workspace"]] },
] as const;

/** Lime footer shared by public pages outside the landing, after the landing's own footer. */
export function SiteFooter() {
  return (
    <footer className="mt-24 overflow-hidden bg-lime text-[hsl(var(--ink))]">
      <div className="mx-auto max-w-[100rem] px-4 pb-8 pt-14 min-[521px]:px-6 min-[1024px]:px-[clamp(1.5rem,3vw,3rem)]">
        <div className="grid gap-10 min-[821px]:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
          <p className="max-w-[22rem] text-[1.0625rem] leading-7">隐私优先的项目平台：展示你所作，守住你所藏。</p>
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-[.75rem] font-medium opacity-60">{column.title}</p>
              <ul className="mt-3 space-y-2">
                {column.links.map(([label, href]) => <li key={href}><Link className="link-grow text-[1.0625rem]" href={href} prefetch={false}>{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p aria-hidden="true" className="mt-16 select-none whitespace-nowrap text-[clamp(3rem,12.5vw,12.5rem)] font-medium leading-[.85] tracking-[-.06em]">AI-Generator</p>
        <div className="mt-6 flex flex-col gap-2 border-t border-[hsl(var(--ink)/.2)] pt-4 text-[.75rem] min-[640px]:flex-row min-[640px]:justify-between">
          <span>© 2026 AI-Generator · www.ai-mdc.com</span>
          <a className="link-grow w-fit" href="https://github.com/ManDik-Chan/AI-Generator" rel="noopener noreferrer" target="_blank">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
