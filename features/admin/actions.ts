"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { roleChangeInputSchema, type PlatformRole, type RoleChangeErrorCode } from "@/features/admin/role-contract";
import { changePlatformRole, SafeRoleUpdateError } from "@/features/admin/role-service";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";

export type AdminRoleActionResult =
  | { ok: true; changed: boolean; member: { id: string; platformRole: PlatformRole; roleVersion: string } }
  | { ok: false; code: RoleChangeErrorCode; currentRole?: PlatformRole; currentVersion?: string; reason?: "SELF" | "OWNER_PROTECTED" };

export async function updateAdminRoleAction(input: unknown): Promise<AdminRoleActionResult> {
  let user: Awaited<ReturnType<typeof requireAdmin>>["user"];
  try {
    ({ user } = await requireAdmin());
  } catch (error) {
    // Preserve framework navigation, while never returning database details.
    if (typeof error === "object" && error !== null && "digest" in error &&
        typeof error.digest === "string" && (error.digest.startsWith("NEXT_REDIRECT") || error.digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))) throw error;
    throw new Error("Role update outcome could not be confirmed.");
  }
  const parsed = roleChangeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_REQUEST" };

  let result: Awaited<ReturnType<typeof changePlatformRole>>;
  try {
    result = await changePlatformRole(prisma, user.id, parsed.data);
  } catch (error) {
    if (error instanceof SafeRoleUpdateError) return { ok: false, code: error.code, ...error.details };
    // These transaction failures are known to have aborted. A concurrent duplicate
    // request ID may first hit P2002; retrying reads the winning receipt.
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
      return { ok: false, code: "UNAVAILABLE" };
    }
    // In particular, a lost commit acknowledgement is not a proven rollback.
    // Do not expose the original exception; the caller maps a throw to UNKNOWN_OUTCOME.
    throw new Error("Role update outcome could not be confirmed.");
  }
  try {
    revalidatePath("/admin");
  } catch {
    // The transaction already committed, but the caller has not received its result.
    throw new Error("Role update outcome could not be confirmed.");
  }
  return { ok: true, ...result };
}
