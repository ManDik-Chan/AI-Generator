import { describe, expect, it } from "vitest";
import { isPlatformPath, safeReturnPath } from "./return-path";

describe("safe platform return paths", () => {
  it.each(["/workspace", "/chat/abc?personaId=demo#reply", "/memories?scope=all", "/agents/run", "/tools/image", "/account", "/admin", "/personas/new", "/hub", "/projects/sorting-lab#runs", "/developer#manifest", "/connections"])("preserves %s", (path) => expect(safeReturnPath(path)).toBe(path));
  it.each([undefined, null, "", "/", "https://evil.test/chat", "//evil.test/chat", "/\\evil.test", "/chat\\@evil.test", "/chat%2f%2fevil.test", "/chat/%252fexternal", "/chat/%2e%2e/enter", "/chat\n", "/login", "/register", "/enter", "/chat-evil", "/memories-other", ["/chat"]])("rejects ambiguous or non-platform target %s", (path) => expect(safeReturnPath(path)).toBe("/workspace"));
  it("preserves encoded query values without interpreting them as destinations", () => expect(safeReturnPath("/chat?prompt=https%3A%2F%2Fexample.com")).toBe("/chat?prompt=https%3A%2F%2Fexample.com"));
  it("matches route boundaries instead of similarly named public paths", () => {
    expect(isPlatformPath("/workspace")).toBe(true);
    expect(isPlatformPath("/agents/run")).toBe(true);
    expect(isPlatformPath("/workspace-other")).toBe(false);
    expect(isPlatformPath("/projects-public")).toBe(false);
    expect(isPlatformPath("/explore/sorting-lab")).toBe(false);
    expect(isPlatformPath("/platform/projects")).toBe(false);
    expect(isPlatformPath("/")).toBe(false);
  });
});
