import { describe, expect, it } from "vitest";

import {
  computeChatViewportMetrics,
  getPreservedChatScrollTop,
  isChatScrollerNearBottom,
} from "@/features/chat/viewport";

describe("Chat visual viewport", () => {
  it("tracks keyboard resize and offsetTop without accumulating an offset", () => {
    expect(computeChatViewportMetrics({ layoutHeight: 844, visualHeight: 540, offsetTop: 0 })).toEqual({
      height: 540,
      top: 0,
      keyboardInset: 304,
    });
    expect(computeChatViewportMetrics({ layoutHeight: 844, visualHeight: 500, offsetTop: 44 })).toEqual({
      height: 500,
      top: 44,
      keyboardInset: 300,
    });
    expect(computeChatViewportMetrics({ layoutHeight: 844, visualHeight: 844, offsetTop: 0 })).toEqual({
      height: 844,
      top: 0,
      keyboardInset: 0,
    });
    expect(computeChatViewportMetrics({ layoutHeight: 844, visualHeight: 540, offsetTop: 0 }).top).toBe(0);
  });

  it("keeps a historical reading anchor while the viewport and composer resize", () => {
    expect(getPreservedChatScrollTop({
      previousScrollTop: 480,
      nextScrollHeight: 2400,
      nextClientHeight: 420,
      shouldFollow: false,
    })).toBe(480);
    expect(getPreservedChatScrollTop({
      previousScrollTop: 480,
      nextScrollHeight: 2400,
      nextClientHeight: 720,
      shouldFollow: false,
    })).toBe(480);
  });

  it("follows the latest message only when the reader is near the bottom", () => {
    expect(isChatScrollerNearBottom(2000, 1300, 600)).toBe(true);
    expect(isChatScrollerNearBottom(2000, 900, 600)).toBe(false);
    expect(getPreservedChatScrollTop({
      previousScrollTop: 1300,
      nextScrollHeight: 2200,
      nextClientHeight: 600,
      shouldFollow: true,
    })).toBe(1600);
  });
});
