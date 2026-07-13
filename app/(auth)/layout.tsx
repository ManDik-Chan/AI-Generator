import type { ReactNode } from "react";
import { Brain, MessageSquareText, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const promises = [
  { icon: MessageSquareText, text: "持续、私密的对话空间" },
  { icon: Brain, text: "由你掌控的长期记忆" },
  { icon: ShieldCheck, text: "聊天、人格与工具清晰隔离" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-screen overflow-hidden bg-background lg:grid-cols-[minmax(0,1.04fr)_minmax(30rem,.96fr)]">
      <div aria-hidden="true" className="paper-dots pointer-events-none fixed inset-0 opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <aside className="relative hidden overflow-hidden border-r border-border/10 bg-surface/52 p-10 backdrop-blur-sm lg:flex lg:flex-col xl:p-14">
        <div aria-hidden="true" className="surface-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(circle_at_68%_45%,black,transparent_60%)]" />
        <div aria-hidden="true" className="premium-aurora absolute -right-24 top-[18%] size-[26rem] rounded-full bg-[#80e2be] opacity-30 blur-[90px] dark:bg-primary/25" />
        <div aria-hidden="true" className="premium-aurora absolute bottom-[-12rem] left-[10%] size-[22rem] rounded-full bg-[#c7b8ff] opacity-20 blur-[90px] dark:bg-[#7768b5]/15" />
        <Brand className="relative z-10" />

        <div className="relative z-10 my-auto grid grid-cols-[minmax(0,1fr)_15rem] items-center gap-8 py-16 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="max-w-xl">
            <p className="premium-kicker">PRIVATE AI STUDIO</p>
            <h1 className="mt-4 text-[clamp(2.7rem,4.4vw,4.8rem)] font-bold leading-[.98] tracking-[-.066em]">
              一个安静、可信的
              <span className="block text-primary">私人 AI 工作空间。</span>
            </h1>
            <p className="mt-6 max-w-lg text-body text-muted-foreground">
              从持续对话到独立工具，每项能力都有明确边界，只在你需要时出现。
            </p>
            <ul className="mt-9 space-y-3.5">
              {promises.map((item) => (
                <li className="flex items-center gap-3 text-sm font-medium" key={item.text}>
                  <span className="grid size-9 place-items-center rounded-control border border-border/10 bg-surface-raised/80 text-primary shadow-soft">
                    <item.icon className="size-4" />
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden="true" className="relative grid aspect-square place-items-center">
            <div className="premium-orbit absolute size-[13rem] rounded-full border border-primary/25 xl:size-[16rem]" />
            <div className="premium-orbit-reverse absolute size-[17rem] rounded-full border border-dashed border-primary/15 xl:size-[21rem]" />
            <div className="premium-float relative z-10 flex size-28 -rotate-3 flex-col items-center justify-center rounded-[2.125rem] bg-foreground text-background shadow-overlay xl:size-32">
              <span className="text-4xl font-extrabold tracking-[-.08em] text-[#8ee0c3]">AI</span>
              <small className="mt-1 text-[.5rem] tracking-[.25em] opacity-70">READY</small>
            </div>
          </div>
        </div>
        <p className="relative z-10 text-caption">简单使用，也经得起长期使用。</p>
      </aside>

      <section className="relative z-10 flex min-h-screen flex-col">
        <div className="flex min-h-[4.25rem] items-center justify-between px-4 py-3 sm:px-8 lg:justify-end">
          <Brand className="lg:hidden" />
          <ThemeToggle compact className="border border-border/12 bg-surface/72" />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 pt-4 sm:px-8 lg:py-12">
          <div className="w-full max-w-[28rem] rounded-[1.625rem] border border-border/12 bg-surface/78 p-5 shadow-overlay backdrop-blur-xl sm:p-8">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
