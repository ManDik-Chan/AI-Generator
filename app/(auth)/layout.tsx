import type { ReactNode } from "react";
import { Brain, MessageSquareText, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const promises = [
  { icon: MessageSquareText, text: "持续、私密的对话空间" },
  { icon: Brain, text: "由你掌控的长期记忆" },
  { icon: ShieldCheck, text: "聊天、人格与工具清晰隔离" },
];

const SPARK = "M32 13c1.8 10.5 7.5 16.2 18 18-10.5 1.8-16.2 7.5-18 18-1.8-10.5-7.5-16.2-18-18 10.5-1.8 16.2-7.5 18-18Z";
const SPARK_SMALL = "M50 41c.6 3.5 2.5 5.4 6 6-3.5.6-5.4 2.5-6 6-.6-3.5-2.5-5.4-6-6 3.5-.6 5.4-2.5 6-6Z";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-[var(--app-height)] overflow-x-clip bg-background lg:grid-cols-[minmax(0,1.04fr)_minmax(30rem,.96fr)]">
      {/* Deep green editorial panel, same voice as the landing page */}
      <aside className="relative hidden overflow-hidden bg-forest p-10 text-[hsl(42_31%_94%)] lg:flex lg:flex-col xl:p-14">
        <svg aria-hidden="true" className="premium-orbit pointer-events-none absolute -bottom-40 -right-40 size-[34rem] fill-current text-[hsl(42_31%_94%/.05)] [animation-duration:60s]" viewBox="12 11 46 44">
          <path d={SPARK} /><path d={SPARK_SMALL} />
        </svg>
        <Brand href="/" className="relative z-10" />

        <div className="relative z-10 my-auto max-w-xl py-16">
          <p className="text-[.8125rem] font-medium text-[hsl(42_31%_94%/.7)]">Private AI studio <span aria-hidden="true">↓</span></p>
          <h1 className="mt-5 text-[clamp(2.6rem,4.2vw,4.6rem)] font-medium leading-[1.03] tracking-[-.04em] text-lime">
            懂你所想，
            <span className="block">守你所藏。</span>
          </h1>
          <p className="mt-6 max-w-lg text-body text-[hsl(42_31%_94%/.72)]">
            从持续对话到独立工具，每项能力都有明确边界，只在你需要时出现。
          </p>
          <ul className="mt-10 border-t border-[hsl(42_31%_94%/.16)]">
            {promises.map((item) => (
              <li className="flex items-center gap-3 border-b border-[hsl(42_31%_94%/.16)] py-3.5 text-sm" key={item.text}>
                <item.icon aria-hidden="true" className="size-4 text-lime" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-caption text-[hsl(42_31%_94%/.6)]">简单使用，也经得起长期使用。</p>
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
