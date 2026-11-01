import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RollText } from "@/components/ui/roll-text";
import { Chars, Roll } from "./primitives";

/** Text a selection, copy, translator or text extractor would see: every text node, tags removed. */
const textOf = (html: string) => html.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
const layer = (html: string, cls: string) => html.match(new RegExp(`<span aria-hidden="true" class="${cls}">(.*?)</span></span>`))?.[1] ?? "";

describe.each([
  { name: "landing Roll", render: (text: string) => renderToStaticMarkup(createElement(Roll, { text })), fx: "roll-t__fx", txt: "roll-t__txt" },
  { name: "shared RollText", render: (text: string) => renderToStaticMarkup(createElement(RollText, { text })), fx: "rt__fx", txt: "rt__txt" },
])("$name keeps one copy of the label in the DOM", ({ render, fx, txt }) => {
  it("exposes the label exactly once to selection, copy, translation and text extraction", () => {
    expect(textOf(render("登录"))).toBe("登录");
    expect(textOf(render("Log in"))).toBe("Log in");
  });

  it("renders the label as one plain text node outside the hidden layer", () => {
    expect(render("AI Hub")).toContain(`<span class="${txt}">AI Hub</span>`);
  });

  it("draws the rolling copies from attributes in an aria-hidden layer with no text of its own", () => {
    const html = render("AI 空间");
    const hidden = layer(html, fx);
    expect(hidden).not.toBe("");
    expect(textOf(hidden)).toBe("");
    const glyphs = [...hidden.matchAll(/data-c="([^"]*)"/g)].map((m) => m[1]);
    // Spaces become U+00A0 so the generated copy keeps its width.
    expect(glyphs).toEqual(["A", "I", " ", "空", "间"]);
  });

  it("does not need a visually hidden duplicate for screen readers", () => {
    expect(render("登录")).not.toContain("sr-only");
  });
});

describe("Chars (scroll-lit copy)", () => {
  it("keeps each line as plain text without per-character elements", () => {
    const html = renderToStaticMarkup(createElement("p", null, createElement(Chars, { lines: ["“好的平台让作品站到台前，", "把边界留在使用者手里。”"] })));
    expect(html).toBe("<p>“好的平台让作品站到台前，<br/>把边界留在使用者手里。”</p>");
  });

  it("keeps spaces and Latin words intact", () => {
    const text = "AI-Generator is becoming a privacy-first project platform.";
    expect(renderToStaticMarkup(createElement("p", null, createElement(Chars, { lines: [text] })))).toBe(`<p>${text}</p>`);
  });
});
