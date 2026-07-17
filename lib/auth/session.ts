import { redirect } from "next/navigation";
import { cache } from "react";

import { prisma } from "@/lib/database/prisma";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

async function readCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
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
    redirect("/");
  }

  return { user, profile };
}
