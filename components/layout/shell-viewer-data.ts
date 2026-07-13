import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import type { ShellViewer } from "@/components/layout/shell-viewer";

export async function getShellViewer(): Promise<ShellViewer | undefined> {
  try {
    const user = await getCurrentUser();
    if (!user) return undefined;

    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: {
        avatarUrl: true,
        displayName: true,
        email: true,
        role: true,
      },
    });

    return {
      avatarUrl: profile?.avatarUrl ?? undefined,
      displayName: profile?.displayName ?? undefined,
      email: profile?.email ?? user.email ?? undefined,
      role: profile?.role,
    };
  } catch {
    return undefined;
  }
}
