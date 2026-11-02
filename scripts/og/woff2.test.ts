import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { tableChecksum, woff2ToTtf } from "./woff2";

const FONTS = join(__dirname, "../../app/fonts");

function tables(font: Buffer) {
  const count = font.readUInt16BE(4);
  return new Map(Array.from({ length: count }, (_, i) => {
    const record = 12 + i * 16;
    return [font.toString("latin1", record, record + 4), { checksum: font.readUInt32BE(record + 4), offset: font.readUInt32BE(record + 8), length: font.readUInt32BE(record + 12) }] as const;
  }));
}

describe("woff2ToTtf", () => {
  it.each(["figtree-latin.woff2", "noto-sans-sc/noto-sans-sc-095.woff2"])("rebuilds a valid TrueType font from %s", (file) => {
    const font = woff2ToTtf(readFileSync(join(FONTS, file)));
    expect(font.readUInt32BE(0)).toBe(0x00010000);
    const directory = tables(font);
    const tags = [...directory.keys()];
    expect(tags).toEqual([...tags].sort());
    for (const tag of ["cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name"]) expect(tags).toContain(tag);

    for (const [tag, { checksum, offset, length }] of directory) {
      const table = Buffer.from(font.subarray(offset, offset + length));
      if (tag === "head") table.writeUInt32BE(0, 8);
      expect(tableChecksum(table), tag).toBe(checksum);
    }
    expect(tableChecksum(font)).toBe(0xb1b0afba);

    // loca must index every glyph monotonically inside glyf.
    const glyphs = font.readUInt16BE(directory.get("maxp")!.offset + 4);
    const longOffsets = font.readInt16BE(directory.get("head")!.offset + 50) === 1;
    const loca = directory.get("loca")!;
    const entry = (i: number) => (longOffsets ? font.readUInt32BE(loca.offset + i * 4) : font.readUInt16BE(loca.offset + i * 2) * 2);
    expect(loca.length).toBe((glyphs + 1) * (longOffsets ? 4 : 2));
    for (let i = 0; i < glyphs; i++) expect(entry(i + 1)).toBeGreaterThanOrEqual(entry(i));
    expect(entry(glyphs)).toBe(directory.get("glyf")!.length);
  });

  it("rejects input that is not WOFF2", () => {
    expect(() => woff2ToTtf(Buffer.from("not a font at all, definitely not"))).toThrow(/signature/);
  });
});
