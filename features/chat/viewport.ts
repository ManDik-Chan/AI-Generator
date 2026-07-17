export const CHAT_VIEWPORT_CHANGE_EVENT = "chatviewportchange";

export interface ChatViewportInput {
  layoutHeight: number;
  visualHeight: number;
  offsetTop: number;
}

export interface ChatViewportMetrics {
  height: number;
  top: number;
  keyboardInset: number;
}

export function computeChatViewportMetrics(input: ChatViewportInput): ChatViewportMetrics {
  const layoutHeight = Math.max(0, input.layoutHeight);
  const height = Math.max(0, Math.min(input.visualHeight, layoutHeight || input.visualHeight));
  const top = Math.max(0, input.offsetTop);

  return {
    height,
    top,
    keyboardInset: Math.max(0, layoutHeight - (top + height)),
  };
}

export function isChatScrollerNearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = 120,
) {
  return scrollHeight - scrollTop - clientHeight < threshold;
}

export function getPreservedChatScrollTop({
  previousScrollTop,
  nextScrollHeight,
  nextClientHeight,
  shouldFollow,
}: {
  previousScrollTop: number;
  nextScrollHeight: number;
  nextClientHeight: number;
  shouldFollow: boolean;
}) {
  const maximum = Math.max(0, nextScrollHeight - nextClientHeight);
  return shouldFollow ? maximum : Math.min(Math.max(0, previousScrollTop), maximum);
}
