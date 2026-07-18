import { AppShell, type AppShellVariant } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/ui/skeleton";

export function AppRouteLoading({ variant = "standard" }: { variant?: AppShellVariant }) {
  return (
    <AppShell variant={variant}>
      <div aria-busy="true" aria-label="正在加载页面内容" className="animate-pulse motion-reduce:animate-none">
        <PageSkeleton />
      </div>
    </AppShell>
  );
}
