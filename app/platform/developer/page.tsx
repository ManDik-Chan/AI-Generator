import type { Metadata } from "next";

import { DeveloperConsole } from "@/features/platform/components/developer-console";

export const metadata: Metadata = { title: "开发者" };

export default function DemoDeveloperPage() {
  return <DeveloperConsole mode="demo" />;
}
