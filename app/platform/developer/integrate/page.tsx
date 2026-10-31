import type { Metadata } from "next";

import { IntegrateView } from "@/features/developer-console/components/integrate-view";

export const metadata: Metadata = { title: "接入" };

export default function DemoIntegratePage() {
  return <IntegrateView base="/platform/developer" />;
}
