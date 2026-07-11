import { redirect } from "next/navigation";

import { prisma } from "@/lib/database/prisma";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

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
