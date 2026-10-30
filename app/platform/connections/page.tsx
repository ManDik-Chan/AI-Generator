import type { Metadata } from "next";

import { ConnectionsView } from "@/features/platform/components/connections-view";
import { listCredentials, listGrants } from "@/features/platform/source";

export const metadata: Metadata = { title: "连接与授权" };

export default function DemoConnectionsPage() {
  return <ConnectionsView credentials={listCredentials().data} grants={listGrants().data} mode="demo" />;
}
