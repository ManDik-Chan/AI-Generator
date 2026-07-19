export default function ChatLoading() {
  return (
    <main aria-busy="true" aria-label="正在加载对话" className="surface-grid app-viewport flex w-full overflow-hidden bg-background" data-chat-loading-shell>
      <aside className="hidden w-[17.5rem] shrink-0 border-r border-border/10 bg-background-subtle/82 md:block">
        <div className="border-b border-border/10 p-4"><div className="h-12 rounded-control bg-surface-muted" /></div>
        <div className="space-y-2 p-4"><div className="h-12 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" /><div className="h-12 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" /></div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col bg-background/72">
        <header className="min-h-[var(--mobile-header-height)] shrink-0 border-b border-border/10 bg-surface/72 md:min-h-[4.25rem]" />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[52rem] flex-1 items-center justify-center px-4 text-sm text-muted-foreground">正在准备对话空间…</div>
          <div className="safe-inline shrink-0 pb-[max(.75rem,var(--safe-area-bottom))] pt-3 sm:px-6 sm:pt-4">
            <div className="premium-panel-strong mx-auto flex max-w-[52rem] items-end gap-2 rounded-[1.35rem] p-2.5 sm:p-3">
              <div className="size-11 shrink-0 rounded-control bg-surface-muted" />
              <div className="min-h-11 flex-1 rounded-control bg-surface-muted" />
              <div className="size-11 shrink-0 rounded-control bg-primary/45" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
