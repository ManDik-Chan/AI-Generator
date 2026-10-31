import type { Metadata } from "next";

import { AccessView } from "@/features/developer-console/components/access-view";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "权限与隐私" };

export default async function AccessPage() {
  await requireUser();
  return <AccessView base="/developer" connectionsHref="/connections" />;
}
