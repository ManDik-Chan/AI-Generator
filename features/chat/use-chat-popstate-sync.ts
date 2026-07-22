"use client";

import { type RefObject, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ActiveConversation {
  id?: string;
}

export function shouldRefreshPoppedChatRoute(pathname: string, activeConversationId?: string) {
  const match = pathname.match(/^\/chat(?:\/([0-9a-f-]{36}))?$/i);
  if (!match) return false;
  const routeConversationId = match[1];
  return routeConversationId ? routeConversationId !== activeConversationId : Boolean(activeConversationId);
}

export function useChatPopstateSync(activeConversationRef: RefObject<ActiveConversation>) {
  const router = useRouter();

  useEffect(() => {
    let frame: number | undefined;
    const synchronizePoppedConversation = () => {
      if (!shouldRefreshPoppedChatRoute(window.location.pathname, activeConversationRef.current.id)) return;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        router.refresh();
      });
    };
    window.addEventListener("popstate", synchronizePoppedConversation);
    return () => {
      window.removeEventListener("popstate", synchronizePoppedConversation);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [activeConversationRef, router]);
}
