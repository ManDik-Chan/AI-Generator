/*
 * Minimal WOFF2 -> TrueType decoder (W3C WOFF2 2.0, section 5), used only by
 * scripts/generate-og-images.ts so share cards are drawn with the exact font files the
 * site serves from app/fonts. Supports single-font TrueType flavours with the standard
 * glyf/loca transform and an untransformed hmtx, which covers every file there.
 */
import { brotliDecompressSync } from "node:zlib";

const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

class Reader {
  constructor(private readonly b: Buffer, public o = 0, private readonly end = b.length) {}

  private need(n: number) {
    if (this.o + n > this.end) throw new Error("WOFF2: truncated stream");
  }

  u8() { this.need(1); return this.b[this.o++]; }
  u16() { this.need(2); const v = this.b.readUInt16BE(this.o); this.o += 2; return v; }
  i16() { this.need(2); const v = this.b.readInt16BE(this.o); this.o += 2; return v; }
  u32() { this.need(4); const v = this.b.readUInt32BE(this.o); this.o += 4; return v; }
  bytes(n: number) { this.need(n); const v = this.b.subarray(this.o, this.o + n); this.o += n; return v; }

  base128() {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = this.u8();
      if (i === 0 && byte === 0x80) throw new Error("WOFF2: invalid UIntBase128");
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("WOFF2: UIntBase128 too long");
  }

  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

interface Point { x: number; y: number; onCurve: boolean }
type Box = [number, number, number, number];

const withSign = (flag: number, value: number) => (flag & 1 ? value : -value);

/** One point's coordinate deltas (spec 5.2, triplet encoding); flag excludes the on-curve bit. */
function readTriplet(flag: number, glyphs: Reader): [number, number] {
  if (flag < 10) return [0, withSign(flag, ((flag & 14) << 7) + glyphs.u8())];
  if (flag < 20) return [withSign(flag, (((flag - 10) & 14) << 7) + glyphs.u8()), 0];
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = glyphs.u8();
    return [withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)), withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f))];
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const x = glyphs.u8();
    const y = glyphs.u8();
    return [withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + x), withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + y)];
  }
  if (flag < 124) {
    const a = glyphs.u8();
    const b = glyphs.u8();
    const c = glyphs.u8();
    return [withSign(flag, (a << 4) + (b >> 4)), withSign(flag >> 1, ((b & 0x0f) << 8) + c)];
  }
  const x = glyphs.u16();
  const y = glyphs.u16();
  return [withSign(flag, x), withSign(flag >> 1, y)];
}

function int16(value: number) {
  const b = Buffer.alloc(2);
  b.writeInt16BE(value);
  return b;
}

/** Standard glyf encoding of a simple glyph (no repeated flags, which is always valid). */
function encodeSimpleGlyph(endPts: number[], points: Point[], instructions: Buffer, bbox: Box, overlap: boolean) {
  const flags: number[] = [];
  const xs: Buffer[] = [];
  const ys: Buffer[] = [];
  let px = 0;
  let py = 0;
  points.forEach((point, index) => {
    let flag = point.onCurve ? 0x01 : 0;
    if (index === 0 && overlap) flag |= 0x40;
    const dx = point.x - px;
    const dy = point.y - py;
    px = point.x;
    py = point.y;
    if (dx === 0) flag |= 0x10;
    else if (Math.abs(dx) < 256) { flag |= 0x02 | (dx > 0 ? 0x10 : 0); xs.push(Buffer.from([Math.abs(dx)])); }
    else xs.push(int16(dx));
    if (dy === 0) flag |= 0x20;
    else if (Math.abs(dy) < 256) { flag |= 0x04 | (dy > 0 ? 0x20 : 0); ys.push(Buffer.from([Math.abs(dy)])); }
    else ys.push(int16(dy));
    flags.push(flag);
  });
  const head = Buffer.alloc(10 + endPts.length * 2 + 2);
  head.writeInt16BE(endPts.length, 0);
  bbox.forEach((value, i) => head.writeInt16BE(value, 2 + i * 2));
  endPts.forEach((value, i) => head.writeUInt16BE(value, 10 + i * 2));
  head.writeUInt16BE(instructions.length, 10 + endPts.length * 2);
  return Buffer.concat([head, instructions, Buffer.from(flags), ...xs, ...ys]);
}

function reconstructGlyf(data: Buffer, expectedGlyphs: number | undefined) {
  const header = new Reader(data);
  header.u16(); // reserved
  const optionFlags = header.u16();
  const numGlyphs = header.u16();
  const indexFormat = header.u16();
  const sizes = Array.from({ length: 7 }, () => header.u32());
  if (expectedGlyphs !== undefined && expectedGlyphs !== numGlyphs) throw new Error("WOFF2: glyph count mismatch");
  let offset = header.o;
  const stream = (size: number) => {
    const reader = new Reader(data, offset, offset + size);
    offset += size;
    return reader;
  };
  const nContours = stream(sizes[0]);
  const nPoints = stream(sizes[1]);
  const flagStream = stream(sizes[2]);
  const glyphs = stream(sizes[3]);
  const composites = stream(sizes[4]);
  const bboxes = stream(sizes[5]);
  const instructionStream = stream(sizes[6]);
  const overlapBitmap = optionFlags & 1 ? data.subarray(offset, offset + ((numGlyphs + 7) >> 3)) : undefined;

  const bboxBitmap = bboxes.bytes(((numGlyphs + 31) >> 5) * 4);
  const bit = (bitmap: Buffer | undefined, i: number) => Boolean(bitmap && bitmap[i >> 3] & (0x80 >> (i & 7)));
  const readBox = (): Box => [bboxes.i16(), bboxes.i16(), bboxes.i16(), bboxes.i16()];

  const out: Buffer[] = [];
  const loca = [0];
  let total = 0;
  for (let i = 0; i < numGlyphs; i++) {
    const contours = nContours.i16();
    let glyph = Buffer.alloc(0);
    if (contours > 0) {
      const endPts: number[] = [];
      let count = 0;
      for (let c = 0; c < contours; c++) {
        count += nPoints.u255();
        endPts.push(count - 1);
      }
      const points: Point[] = [];
      let x = 0;
      let y = 0;
      for (let p = 0; p < count; p++) {
        const flag = flagStream.u8();
        const [dx, dy] = readTriplet(flag & 0x7f, glyphs);
        x += dx;
        y += dy;
        points.push({ x, y, onCurve: !(flag & 0x80) });
      }
      const instructions = Buffer.from(instructionStream.bytes(glyphs.u255()));
      const xsAll = points.map((point) => point.x);
      const ysAll = points.map((point) => point.y);
      const bbox: Box = bit(bboxBitmap, i) ? readBox() : [Math.min(...xsAll), Math.min(...ysAll), Math.max(...xsAll), Math.max(...ysAll)];
      glyph = encodeSimpleGlyph(endPts, points, instructions, bbox, bit(overlapBitmap, i));
    } else if (contours === -1) {
      if (!bit(bboxBitmap, i)) throw new Error("WOFF2: composite glyph without bbox");
      const bbox = readBox();
      const start = composites.o;
      let flags: number;
      let hasInstructions = false;
      do {
        flags = composites.u16();
        composites.u16(); // component glyph index
        composites.bytes(flags & 0x0001 ? 4 : 2);
        if (flags & 0x0008) composites.bytes(2);
        else if (flags & 0x0040) composites.bytes(4);
        else if (flags & 0x0080) composites.bytes(8);
        if (flags & 0x0100) hasInstructions = true;
      } while (flags & 0x0020);
      const head = Buffer.alloc(10);
      head.writeInt16BE(-1, 0);
      bbox.forEach((value, k) => head.writeInt16BE(value, 2 + k * 2));
      const parts = [head, Buffer.from(data.subarray(start, composites.o))];
      if (hasInstructions) {
        const length = glyphs.u255();
        const lengthField = Buffer.alloc(2);
        lengthField.writeUInt16BE(length);
        parts.push(lengthField, Buffer.from(instructionStream.bytes(length)));
      }
      glyph = Buffer.concat(parts);
    } else if (contours !== 0) {
      throw new Error("WOFF2: invalid contour count");
    }
    const padded = Buffer.concat([glyph, Buffer.alloc((4 - (glyph.length % 4)) % 4)]);
    out.push(padded);
    total += padded.length;
    loca.push(total);
  }

  const locaTable = Buffer.alloc((numGlyphs + 1) * (indexFormat ? 4 : 2));
  loca.forEach((value, i) => (indexFormat ? locaTable.writeUInt32BE(value, i * 4) : locaTable.writeUInt16BE(value / 2, i * 2)));
  return { glyf: Buffer.concat(out), loca: locaTable, indexFormat };
}

/** OpenType table checksum (sum of big-endian uint32 words, zero-padded). */
export function tableChecksum(buffer: Buffer) {
  const padded = Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4)]);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/** Decode a WOFF2 buffer into an sfnt (TrueType) buffer. */
export function woff2ToTtf(input: Buffer): Buffer {
  const r = new Reader(input);
  if (r.u32() !== 0x774f4632) throw new Error("WOFF2: bad signature");
  const flavor = r.u32();
  if (flavor === 0x74746366) throw new Error("WOFF2: font collections are not supported");
  r.u32(); // length
  const numTables = r.u16();
  r.u16(); // reserved
  r.u32(); // totalSfntSize
  const compressedSize = r.u32();
  r.o += 2 + 2 + 4 + 4 + 4 + 4 + 4; // version, metadata block, private block

  const directory: { tag: string; length: number; transformed: boolean }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = r.u8();
    const tag = (flags & 0x3f) === 0x3f ? r.bytes(4).toString("latin1") : KNOWN_TAGS[flags & 0x3f];
    const version = flags >> 6;
    const origLength = r.base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    if (transformed && tag !== "glyf" && tag !== "loca") throw new Error(`WOFF2: unsupported ${tag} transform`);
    directory.push({ tag, length: transformed ? r.base128() : origLength, transformed });
  }

  const stream = brotliDecompressSync(input.subarray(r.o, r.o + compressedSize));
  const tables = new Map<string, Buffer>();
  let offset = 0;
  for (const entry of directory) {
    tables.set(entry.tag, stream.subarray(offset, offset + entry.length));
    offset += entry.length;
  }

  const head = Buffer.from(tables.get("head") ?? Buffer.alloc(0));
  if (head.length < 54) throw new Error("WOFF2: missing head table");
  if (directory.find((entry) => entry.tag === "glyf")?.transformed) {
    const glyfData = tables.get("glyf");
    if (!glyfData) throw new Error("WOFF2: missing glyf table");
    const maxp = tables.get("maxp");
    const { glyf, loca, indexFormat } = reconstructGlyf(glyfData, maxp ? maxp.readUInt16BE(4) : undefined);
    tables.set("glyf", glyf);
    tables.set("loca", loca);
    head.writeInt16BE(indexFormat, 50);
  }
  head.writeUInt32BE(0, 8); // checkSumAdjustment, recomputed below
  tables.set("head", head);

  const tags = [...tables.keys()].sort();
  const entrySelector = Math.floor(Math.log2(tags.length));
  const searchRange = 2 ** entrySelector * 16;
  const offsetTable = Buffer.alloc(12 + tags.length * 16);
  offsetTable.writeUInt32BE(flavor, 0);
  offsetTable.writeUInt16BE(tags.length, 4);
  offsetTable.writeUInt16BE(searchRange, 6);
  offsetTable.writeUInt16BE(entrySelector, 8);
  offsetTable.writeUInt16BE(tags.length * 16 - searchRange, 10);
  const bodies: Buffer[] = [];
  let position = offsetTable.length;
  let headOffset = 0;
  tags.forEach((tag, i) => {
    const table = tables.get(tag) as Buffer;
    const record = 12 + i * 16;
    if (tag === "head") headOffset = position;
    offsetTable.write(tag, record, 4, "latin1");
    offsetTable.writeUInt32BE(tableChecksum(table), record + 4);
    offsetTable.writeUInt32BE(position, record + 8);
    offsetTable.writeUInt32BE(table.length, record + 12);
    const padded = Buffer.concat([table, Buffer.alloc((4 - (table.length % 4)) % 4)]);
    bodies.push(padded);
    position += padded.length;
  });
  const font = Buffer.concat([offsetTable, ...bodies]);
  font.writeUInt32BE((0xb1b0afba - tableChecksum(font)) >>> 0, headOffset + 8);
  return font;
}
