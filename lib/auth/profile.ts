import type { User } from "@supabase/supabase-js";

import { prisma } from "@/lib/database/prisma";

export async function ensureProfile(user: User) {
  const displayName =
    typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : user.email?.split("@")[0] ?? "User";

  return prisma.profile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@invalid.local`,
      displayName,
    },
    update: {
      email: user.email ?? `${user.id}@invalid.local`,
      displayName,
    },
  });
}
