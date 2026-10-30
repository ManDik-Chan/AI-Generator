import { describe, expect, it } from "vitest";

import { curlCommand, prettyJson } from "@/features/demos/components/format";

describe("curlCommand", () => {
  // Regression: PR #36 a70d294 — the docs request console built a curl for the GET
  // preset with no body; JSON.stringify(undefined).replace threw during render.
  it("builds a GET command when there is no body", () => {
    expect(() => curlCommand("https://example.test/api/demo/v1/capabilities")).not.toThrow();
    expect(curlCommand("https://example.test/api/demo/v1/capabilities")).toBe("curl -sS 'https://example.test/api/demo/v1/capabilities'");
  });

  it("keeps GET free of POST-only flags and headers", () => {
    const command = curlCommand("https://example.test/api/demo/v1/capabilities", undefined);
    expect(command).not.toMatch(/-X POST|-d |Content-Type/);
  });

  it("builds a JSON POST when there is a body", () => {
    expect(curlCommand("https://example.test/api/demo/v1/runs", { capability: "route-optimizer.solve", input: {} })).toBe(
      [
        "curl -sS -X POST 'https://example.test/api/demo/v1/runs' \\",
        "  -H 'Content-Type: application/json' \\",
        `  -d '{"capability":"route-optimizer.solve","input":{}}'`,
      ].join("\n"),
    );
  });

  it("adds -N and the event-stream Accept header for streams", () => {
    const command = curlCommand("https://example.test/api/demo/v1/runs", { a: 1 }, { stream: true });
    expect(command.split("\n")[0]).toBe("curl -sSN -X POST 'https://example.test/api/demo/v1/runs' \\");
    expect(command).toContain("  -H 'Accept: text/event-stream' \\");
  });

  it("escapes single quotes for POSIX shells", () => {
    expect(curlCommand("https://example.test/x", { text: "it's" })).toContain(`-d '{"text":"it'\\''s"}'`);
    expect(curlCommand("https://example.test/it's")).toBe("curl -sS 'https://example.test/it'\\''s'");
  });
});

describe("prettyJson", () => {
  it("shortens long arrays and keeps short numeric arrays on one line", () => {
    const text = prettyJson({ tour: Array.from({ length: 20 }, (_, i) => i), point: [1, 2] });
    expect(text).toContain('"… 另有 12 项"');
    expect(text).toContain('"point": [1, 2]');
  });

  it("returns an empty string for undefined", () => {
    expect(prettyJson(undefined)).toBe("");
  });
});
