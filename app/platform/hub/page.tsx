import type { Metadata } from "next";

import { HubOverview } from "@/features/platform/components/hub-overview";
import { demoMetrics } from "@/features/platform/demo/workspace";

export const metadata: Metadata = { title: "AI Hub" };

export default function DemoHubPage() {
  return <HubOverview metrics={demoMetrics} mode="demo" />;
}
