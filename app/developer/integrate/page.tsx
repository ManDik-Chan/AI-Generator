import type { Metadata } from "next";

import { IntegrateView } from "@/features/developer-console/components/integrate-view";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "接入" };

export default async function IntegratePage() {
  await requireUser();
  return <IntegrateView base="/developer" />;
}
