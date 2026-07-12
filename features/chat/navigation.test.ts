import { describe, expect, it } from "vitest";
import { CHAT_HOME_NAVIGATION } from "@/features/chat/navigation";

describe("chat home navigation", () => {
  it("uses a direct, accessible home destination for shared and header links", () => {
    expect(CHAT_HOME_NAVIGATION).toEqual({ href: "/", label: "返回首页", title: "返回首页" });
  });
});
