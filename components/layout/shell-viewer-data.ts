import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import type { ShellViewer } from "@/components/layout/shell-viewer";
import { platformCapabilities, type PlatformRole } from "@/features/admin/role-contract";

type ShellProfile = { avatarUrl: string | null; displayName: string | null; email: string | null; role: PlatformRole } | null | undefined;

/** The shell's view of the signed-in user; the admin entry follows the server's capability check. */
export function shellViewerFromProfile(profile: ShellProfile, fallbackEmail?: string | null): ShellViewer {
  return {
    avatarUrl: profile?.avatarUrl ?? undefined,
    displayName: profile?.displayName ?? undefined,
    email: profile?.email ?? fallbackEmail ?? undefined,
    canAccessAdmin: profile ? platformCapabilities(profile.role).canAccessAdmin : false,
  };
}

export const getShellViewer = cache(async (): Promise<ShellViewer | undefined> => {
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

    return shellViewerFromProfile(profile, user.email);
  } catch {
    return undefined;
  }
});
