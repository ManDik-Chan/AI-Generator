import { NextResponse } from "next/server";

import type { ChatBootstrapPayload } from "@/features/chat/bootstrap-types";
import { getConversationList } from "@/features/chat/queries";
import { getActivePersonaChoices } from "@/features/persona/queries";
import { createSupabaseServerClient } from "@/lib/auth/supabase/server";

export const runtime = "nodejs";

async function measure<T>(task: () => Promise<T>) {
  const startedAt = performance.now();
  const value = await task();
  return { value, durationMs: performance.now() - startedAt };
}

export async function GET(request: Request) {
  const requestStartedAt = performance.now();
  const auth = await measure(async () => (await (await createSupabaseServerClient()).auth.getUser()).data.user);
  if (!auth.value) return NextResponse.json({ message: "请先登录。" }, { status: 401 });

  const includePersonas = new URL(request.url).searchParams.get("personas") !== "0";
  const [conversations, personas] = await Promise.all([
    measure(() => getConversationList(auth.value!.id)),
    includePersonas
      ? measure(() => getActivePersonaChoices(auth.value!.id))
      : Promise.resolve({ value: [], durationMs: 0 }),
  ]);
  const payload: ChatBootstrapPayload = {
    conversations: conversations.value,
    personas: personas.value,
  };
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": [
        `auth;dur=${auth.durationMs.toFixed(1)}`,
        `conversations;dur=${conversations.durationMs.toFixed(1)}`,
        `personas;dur=${personas.durationMs.toFixed(1)}`,
        `total;dur=${(performance.now() - requestStartedAt).toFixed(1)}`,
      ].join(", "),
    },
  });
}
