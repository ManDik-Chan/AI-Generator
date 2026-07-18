export default function ChatLoading() {
  return (
    <main aria-busy="true" aria-label="正在加载对话" className="surface-grid app-viewport grid grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
      <div className="h-[var(--mobile-header-height)] border-b border-border/10 bg-surface-raised/75" />
      <div className="mx-auto flex w-full max-w-[52rem] flex-col justify-end gap-4 px-4 py-6">
        <div className="h-20 w-3/4 animate-pulse self-end rounded-card bg-surface-muted motion-reduce:animate-none" />
        <div className="h-28 w-5/6 animate-pulse rounded-card bg-surface-muted motion-reduce:animate-none" />
      </div>
      <div className="h-24 border-t border-border/10 bg-surface-raised/75" />
    </main>
  );
}
