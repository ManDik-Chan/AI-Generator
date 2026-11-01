import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/database/prisma";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";
import { getValidatedUser } from "@/lib/auth/supabase/validated-user";

async function readCurrentUser() {
  const supabase = await createSupabaseServerClient();
  return getValidatedUser(supabase);
}

export const getCurrentUser = cache(readCurrentUser);

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  const profile = await prisma.profile.findUnique({ where: { id: user.id } });

  if (profile?.role !== "ADMIN") {
    redirect("/workspace");
  }

  return { user, profile };
}
