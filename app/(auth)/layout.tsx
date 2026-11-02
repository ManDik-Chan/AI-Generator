import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Brain, FolderKanban, ShieldCheck } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { ArtSurface } from "@/components/platform/art";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const promises = [
  { icon: FolderKanban, text: "以项目组织你的成果、版本与运行" },
  { icon: Brain, text: "长期记忆只在你确认后写入" },
  { icon: ShieldCheck, text: "可见性、数据与授权分开治理" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-[var(--app-height)] overflow-x-clip bg-background lg:grid-cols-[minmax(0,1.04fr)_minmax(30rem,.96fr)]">
      {/* Forest panel with the landing page's procedural art, same voice as the site */}
      <aside className="relative hidden overflow-hidden bg-forest p-10 text-[hsl(var(--paper))] lg:flex lg:flex-col xl:p-14">
        <ArtSurface className="absolute inset-0 opacity-70" k="agents" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(160deg,hsl(var(--forest)/.55),hsl(var(--forest)/.92)_70%)]" />
        <Brand href="/" className="relative z-10 text-[hsl(var(--paper))]" />

        <div className="relative z-10 my-auto max-w-xl py-16">
          <p className="kicker text-[hsl(var(--paper)/.75)]">AIG Platform<span aria-hidden="true" className="kicker__arrow text-[hsl(var(--paper)/.6)]">↓</span></p>
          {/* Brand tagline, not a heading: the form's title is the page's only h1. */}
          <p className="mt-5 text-[clamp(2.6rem,4.2vw,4.6rem)] font-medium leading-[1.03] tracking-[-.04em] text-lime">
            <span className="title-line"><span>展你所作，</span></span>
            <span className="title-line" style={{ "--d": 90 } as CSSProperties}><span>守你所藏。</span></span>
          </p>
          <p className="enter mt-6 max-w-lg text-[.9375rem] leading-7 text-[hsl(var(--paper)/.75)]" style={{ "--d": 260 } as CSSProperties}>
            登录后进入你的工作台：项目、开发者控制台，以及已经上线的 AI Hub。
          </p>
          <ul className="mt-10 border-t border-[hsl(var(--paper)/.16)]">
            {promises.map((item) => (
              <li className="flex items-center gap-3 border-b border-[hsl(var(--paper)/.16)] py-3.5 text-sm" key={item.text}>
                <item.icon aria-hidden="true" className="size-4 text-lime" />
                {item.text}
              </li>
            ))}
          </ul>
          <Link className="group mt-8 inline-flex items-center gap-2 text-sm text-[hsl(var(--paper))]" href="/platform" prefetch={false}>
            <span className="link-grow">还没准备好？先浏览演示工作台</span>
            <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-500 ease-out-expo group-hover:translate-x-1" />
          </Link>
        </div>
        <p className="relative z-10 text-caption text-[hsl(var(--paper)/.6)]">www.ai-mdc.com · 隐私优先的项目平台</p>
      </aside>

      <section className="relative z-10 flex min-h-[var(--app-height)] flex-col">
        <div className="flex min-h-[4.25rem] items-center justify-between px-4 py-3 sm:px-8 lg:justify-end">
          <Brand href="/" className="lg:hidden" />
          <ThemeToggle compact className="rounded-full border border-border/12 bg-surface-raised" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 pt-4 sm:px-8 lg:py-12">
          <div className="w-full max-w-[28rem] rounded-card border border-border/10 bg-surface-raised p-5 sm:p-8">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
