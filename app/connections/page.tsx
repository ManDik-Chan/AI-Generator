import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { ConnectionsView } from "@/features/platform/components/connections-view";
import { listCredentials, listGrants } from "@/features/platform/source";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "连接与授权" };

export default async function ConnectionsPage() {
  await requireUser();
  return <AppShell mobileTitle="连接与授权" variant="wide"><ConnectionsView credentials={listCredentials().data} grants={listGrants().data} mode="live" /></AppShell>;
}
