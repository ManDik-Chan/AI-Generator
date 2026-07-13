import { AppShell } from "@/components/layout/app-shell";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import {
  HomeDashboard,
  type HomeConversationPreview,
} from "@/features/home/components/home-dashboard";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser().catch(() => null);
  let viewer: ShellViewer | undefined;
  let latestConversation: HomeConversationPreview | undefined;

  if (user) {
    const [profile, conversation] = await Promise.all([
      prisma.profile
        .findUnique({
          where: { id: user.id },
          select: {
            avatarUrl: true,
            displayName: true,
            email: true,
            role: true,
          },
        })
        .catch(() => null),
      prisma.conversation
        .findFirst({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            persona: { select: { name: true } },
          },
        })
        .catch(() => null),
    ]);

    viewer = {
      avatarUrl: profile?.avatarUrl ?? undefined,
      displayName: profile?.displayName ?? undefined,
      email: profile?.email ?? user.email ?? undefined,
      role: profile?.role,
    };
    latestConversation = conversation
      ? {
          id: conversation.id,
          personaName: conversation.persona?.name,
          title: conversation.title,
          updatedAt: conversation.updatedAt.toISOString(),
        }
      : undefined;
  }

  return (
    <AppShell variant="wide" viewer={viewer}>
      <HomeDashboard
        displayName={viewer?.displayName}
        latestConversation={latestConversation}
      />
    </AppShell>
  );
}
