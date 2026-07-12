import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ImageProviderError, toPublicImageError } from "@/lib/ai/image/errors";

export async function requireAvatarApiUser() { return (await getCurrentUser()) ?? null; }

export function avatarApiError(error: unknown) {
  const status = error instanceof ImageProviderError && error.code === "RATE_LIMITED" ? 429 :
    error instanceof ImageProviderError && error.code === "INVALID_RESPONSE" ? 400 : 500;
  return NextResponse.json({ error: toPublicImageError(error) }, { status });
}
