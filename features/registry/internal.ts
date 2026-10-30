import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { prisma } from "@/lib/database/prisma";

const creation = z.object({ slug: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/) }).strict();

/** Internal foundation only; no route, DTO or publication command in B1. */
export async function createInternalRegistryProject(accessToken: string, input: unknown) {
  if (process.env.REGISTRY_INTERNAL_ACCESS_ENABLED !== "true") {
    throw new Error("Registry internal access is disabled");
  }
  const { slug } = creation.parse(input);
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Verify with Auth every time; never trust decoded JWTs or payload owner IDs.
  const { data, error } = await auth.auth.getUser(accessToken);
  if (error || !data.user || data.user.is_anonymous) throw new Error("Registry authentication required");
  const subject = data.user.id;
  return prisma.$transaction(async (tx) => {
    // Share lock serializes qualification revocation with this transaction.
    const operators = await tx.$queryRaw<{ subject_id: string }[]>`
      SELECT subject_id FROM registry_private.internal_operators
      WHERE subject_id=${subject}::uuid AND active AND can_create
        AND expires_at>statement_timestamp() FOR SHARE`;
    if (operators.length !== 1) throw new Error("Eligible internal creator required");
    const project = await tx.project.create({ data: { slug, ownerId: subject }, select: { id: true, slug: true } });
    await tx.projectDraft.create({ data: { projectId: project.id, updatedBy: subject } });
    return project;
  });
}
