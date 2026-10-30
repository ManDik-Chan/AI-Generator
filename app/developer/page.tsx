import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { DeveloperConsole } from "@/features/platform/components/developer-console";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "开发者" };

export default async function DeveloperPage() {
  await requireUser();
  return <AppShell mobileTitle="开发者" variant="wide"><DeveloperConsole mode="live" /></AppShell>;
}
