import { describe, expect, it } from "vitest";

import { presetCurl, presets } from "@/features/docs/try-it-presets";

const origin = "https://example.test";
const bodyOf = (id: string) => {
  const preset = presets.find((item) => item.id === id)!;
  return preset.body ? JSON.stringify(preset.body, null, 2) : "";
};

// Regression: PR #36 a70d294 — selecting the GET preset 「能力列表」 crashed the request
// console while it rendered the copy-as-curl button (all three CI browsers).
describe("TryIt presets", () => {
  it.each(presets.map((preset) => [preset.label, preset] as const))("%s builds its curl without throwing", (_label, preset) => {
    expect(() => presetCurl(preset, bodyOf(preset.id), origin)).not.toThrow();
    expect(presetCurl(preset, bodyOf(preset.id), origin)).toContain(`'${origin}${preset.path}'`);
  });

  it("copies a plain GET for 能力列表", () => {
    const list = presets.find((preset) => preset.label === "能力列表")!;
    expect(list.method).toBe("GET");
    expect(presetCurl(list, "", origin)).toBe("curl -sS 'https://example.test/api/demo/v1/capabilities'");
  });

  it("never attaches a body to a GET, even if the editor holds text", () => {
    const list = presets.find((preset) => preset.method === "GET")!;
    expect(presetCurl(list, '{"stale":true}', origin)).not.toMatch(/-d |-X POST|Content-Type/);
  });

  it("copies the edited body for POST presets and the stream header for 事件流", () => {
    const run = presets.find((preset) => preset.id === "run")!;
    expect(presetCurl(run, '{"capability":"route-optimizer.solve","input":{"instance":{"kind":"grid","count":9}}}', origin)).toContain(`-d '{"capability":"route-optimizer.solve","input":{"instance":{"kind":"grid","count":9}}}'`);
    const stream = presets.find((preset) => preset.id === "stream")!;
    expect(presetCurl(stream, bodyOf("stream"), origin)).toMatch(/^curl -sSN -X POST[\s\S]*Accept: text\/event-stream/);
  });
});
