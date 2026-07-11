import type { ReactNode } from "react";

import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <section className="rounded-2xl border bg-card p-6 shadow-soft sm:p-8">{children}</section>
      </div>
    </main>
  );
}
