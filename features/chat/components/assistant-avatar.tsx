import { Bot } from "lucide-react";
import { resolveAssistantAvatarIdentity } from "@/features/chat/assistant-identity";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaChatIdentity } from "@/features/persona/types";
import { cn } from "@/lib/utils";

export interface AssistantAvatarProps {
  persona?: PersonaChatIdentity;
  className?: string;
}

export function AssistantAvatar({ persona, className }: AssistantAvatarProps) {
  const identity = resolveAssistantAvatarIdentity(persona);
  if (identity.kind === "persona") {
    return <PersonaAvatar className={cn("size-8 rounded-xl", className)} name={identity.name} src={identity.avatarUrl} />;
  }
  return <span aria-label="默认 AI 助手头像" className={cn("grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground", className)}><Bot className="size-1/2" /></span>;
}
