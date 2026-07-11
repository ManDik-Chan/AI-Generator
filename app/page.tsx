import { AppShell } from "@/components/layout/app-shell";
import { HomeDashboard } from "@/features/home/components/home-dashboard";

export default function HomePage() {
  return (
    <AppShell>
      <HomeDashboard />
    </AppShell>
  );
}
