import { AppShell } from "@/components/layout/app-shell";
import { HomeDashboard } from "@/features/home/components/home-dashboard";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);
  const profile = user ? await prisma.profile.findUnique({ where: { id: user.id }, select: { displayName: true } }).catch(() => null) : null;
  return (
    <AppShell variant="wide">
      <HomeDashboard displayName={profile?.displayName ?? undefined} />
    </AppShell>
  );
}
