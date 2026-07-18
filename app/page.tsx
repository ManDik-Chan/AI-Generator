import { AppShell } from "@/components/layout/app-shell";
import { HomeDashboard } from "@/features/home/components/home-dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell variant="wide">
      <HomeDashboard />
    </AppShell>
  );
}
