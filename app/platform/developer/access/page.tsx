import type { Metadata } from "next";

import { AccessView } from "@/features/developer-console/components/access-view";

export const metadata: Metadata = { title: "权限与隐私" };

export default function DemoAccessPage() {
  return <AccessView base="/platform/developer" connectionsHref="/platform/connections" />;
}
