import { AppShell } from "@/components/layout/app-shell";
import { HomeDashboard } from "@/features/home/components/home-dashboard";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  await requireUser();
  return <AppShell variant="wide"><HomeDashboard /></AppShell>;
}
