import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { getHomePersonalization } from "@/features/home/data";
import { HubOverview } from "@/features/platform/components/hub-overview";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Hub" };

export default async function HubPage() {
  await requireUser();
  const { metrics } = await getHomePersonalization();
  return <AppShell mobileTitle="AI Hub" variant="wide"><HubOverview metrics={metrics} mode="live" /></AppShell>;
}
