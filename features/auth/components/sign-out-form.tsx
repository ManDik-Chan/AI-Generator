"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { clearChatGenerationRegistry } from "@/features/generation/conversation-registry";

export function SignOutForm() {
  return (
    <form action={signOut} onSubmit={() => clearChatGenerationRegistry()}>
      <Button type="submit" variant="outline">
        <LogOut className="size-4" />退出登录
      </Button>
    </form>
  );
}
